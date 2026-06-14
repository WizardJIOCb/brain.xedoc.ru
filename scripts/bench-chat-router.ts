/**
 * Standalone benchmark for the hybrid chat router local-only path.
 *
 *   pnpm bench:router
 *
 * Measures wall-clock latency (p50, p95, p99) over N iterations of each
 * deterministic step in the local pre-pass. Embedding + NLI + OpenAI
 * paths are intentionally excluded — they depend on external services
 * and warm-cache state and are not amenable to micro-benchmarking.
 *
 * Use to catch perf regressions on the heuristic layer (chrono parsing,
 * lexical mention scan, collapse-pattern lookup, cache key hashing,
 * skip-gate decision) before they ship.
 */
/* eslint-disable no-console */
import {
  classifyIntentLocally,
  shouldSkipLLM,
} from '../src/admin/chat-router.service';
import { ChatRouterCacheService } from '../src/admin/chat-router-cache.service';
import {
  extractCollapseEditsLocally,
  type CollapseSnapshot,
} from '../src/admin/collapse-pattern.service';
import type { ConfigService } from '@nestjs/config';

const cfg = (): ConfigService =>
  ({
    get: (_: string, d?: string) => d,
  }) as unknown as ConfigService;

function bench(label: string, iters: number, fn: () => unknown): void {
  // Warmup
  for (let i = 0; i < Math.min(1000, iters); i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < iters; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1000); // µs
  }
  samples.sort((a, b) => a - b);
  const p = (q: number) => samples[Math.floor((samples.length - 1) * q)];
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log(
    `${label.padEnd(40)} mean=${mean.toFixed(2)}µs  p50=${p(0.5).toFixed(2)}µs  p95=${p(0.95).toFixed(2)}µs  p99=${p(0.99).toFixed(2)}µs`,
  );
}

async function main() {
  const iters = parseInt(process.env.BENCH_ITERS ?? '10000', 10);
  console.log(`Hybrid router local-path bench  (iters=${iters})\n`);

  // ── classifyIntentLocally — pure regex ────────────────────────────
  bench('classifyIntent: `?` fast path', iters, () =>
    classifyIntentLocally('where Maria lives?'),
  );
  bench('classifyIntent: declarative', iters, () =>
    classifyIntentLocally('Maria moves to Dublin next month'),
  );

  // ── ChatRouterCacheService — sha256 hashing + LRU ─────────────────
  const cache = new ChatRouterCacheService(cfg());
  const keyArgs = {
    companyId: 'demo_live',
    message: 'where Maria lives next month?',
    knownNames: ['Maria Petrov', 'Acme', 'John', 'Anna', 'Petr'],
    predicateVocab: ['address', 'status', 'preference', 'intent'],
    hasTemporal: true,
    now: new Date(),
  };
  bench('cache.computeKey', iters, () => cache.computeKey(keyArgs));
  const warmKey = cache.computeKey(keyArgs);
  cache.set(warmKey, {
    intent: 'ask',
    normalizedMessage: keyArgs.message,
    mentions: [],
    predicateHints: [],
  });
  bench('cache.get (hit)', iters, () => cache.get(warmKey));
  bench('cache.get (miss)', iters, () => cache.get('nonexistent-key'));

  // ── extractCollapseEditsLocally — lexical scan ────────────────────
  const snap: CollapseSnapshot = {
    patterns: new Map([
      ['moved to', { pattern: 'moved to', replacement: 'lives in' }],
      ['moves to', { pattern: 'moves to', replacement: 'lives in' }],
      ['switched to', { pattern: 'switched to', replacement: 'now prefers' }],
      ['joined as', { pattern: 'joined as', replacement: 'is the' }],
      ['переехал в', { pattern: 'переехал в', replacement: 'живёт в' }],
    ]),
  };
  bench('extractCollapse: hit', iters, () =>
    extractCollapseEditsLocally(
      'Maria moved to Berlin last month',
      snap,
    ),
  );
  bench('extractCollapse: miss', iters, () =>
    extractCollapseEditsLocally('Maria is the CTO', snap),
  );

  // ── shouldSkipLLM — synchronous gate logic ────────────────────────
  const span = { text: 'q', start: 0, end: 1 };
  const skipArgs = {
    intent: 'ask' as const,
    intentConfidence: 0.95,
    intentConfidenceFloor: 0.85,
    localMentions: [{ canonical: 'Maria', span }],
    localHints: [{ predicateId: 'address', similarity: 0.6, triggerSpan: span }],
    localCollapses: [],
  };
  bench('shouldSkipLLM', iters, () => shouldSkipLLM(skipArgs));

  console.log('\nDone.');
}

void main();

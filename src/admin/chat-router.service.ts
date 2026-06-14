import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as chrono from 'chrono-node';
import { traceArtifact, traceSpan } from '../common/debug-trace';
import {
  PredicateRegistryService,
  type PredicateSnapshot,
} from '../ai/predicate-registry.service';
import { EmbedderService } from '../ai/embedder.service';
import { cosineSimilarity } from '../common/vector-math';
import { ChatRouterCacheService } from './chat-router-cache.service';
import {
  CollapsePatternService,
  extractCollapseEditsLocally,
} from './collapse-pattern.service';
import { IntentClassifierService } from './intent-classifier.service';

/**
 * Grounded chat router for the brain demo.
 *
 * Architectural rule of this service: every output field that drives
 * downstream behaviour MUST be grounded in the user message via deterministic
 * server-side validation. The LLM never emits a free-text rewrite or a
 * "default" timestamp — instead it returns STRUCTURED EDIT OPERATIONS and
 * SPAN-ANCHORED slots, all of which the server validates by checking that
 * the claimed substring actually appears in the input.
 *
 * The pattern follows 2025-26 SOTA practice for grounded LLM routers /
 * extractors:
 *   • LangExtract (Google) — character-offset spans + fuzzy alignment
 *   • Anthropic Citations API — cited_text + char range validated server-side
 *   • 5IDER / R-Bot — predict EDIT operations, not strings
 *   • EDC / ODKE+ — provenance per transform
 *   • PARSE (arXiv:2510.08623) — offline schema iteration, not online retry
 *
 * Output contract:
 *   intent          — closed enum
 *   edits[]         — structured edit script. Server applies in order to
 *                     produce normalizedMessage and cleanedQuery. Killing the
 *                     free-text rewrite is what removes the "silently drops a
 *                     clause" failure mode by construction.
 *   mentions[]      — entities the message names, each with a Span pointing
 *                     into the original message.
 *   predicateHints[]— predicate IDs the question targets, each with a Span
 *                     showing WHICH words in the input warranted the hint.
 *   asOf?           — { iso, anchorSpan } — only kept when the anchor is
 *                     grounded. No anchor → null.
 *   validFrom?      — same shape as asOf.
 *   reason          — free text for trace; never consumed downstream.
 *
 * Server-side validation pipeline (degrade-on-fail per slot, never reject
 * the whole route):
 *   1. JSON parse (strict mode in LLM API)
 *   2. NFC-normalize input + every Span.text
 *   3. Per-Span: input.slice(start,end) === text? If not, attempt repair via
 *      first-substring-match. If still no, drop the field.
 *   4. Vocab filter: predicateHints[].predicateId ∈ registry snapshot;
 *      mentions[].canonical ∈ knownNames or null.
 *   5. Cross-field consistency: intent='tell' ⇒ predicateHints empty +
 *      asOf null; intent='ask' ⇒ validFrom null.
 *   6. Apply edits[] right-to-left to original message → normalizedMessage.
 *      Apply edits[] minus canonicalize → cleanedQuery (ask only).
 *   7. Emit ChatRoute + ValidationReport trace artifact.
 */

/** Character-offset span pointing into the original user message. */
export interface Span {
  /** Verbatim text at [start, end). Survives NFC normalization round-trip. */
  text: string;
  /** Inclusive UTF-16 code-unit offset into the original message. */
  start: number;
  /** Exclusive UTF-16 code-unit offset. */
  end: number;
}

/**
 * Structured edit operations the LLM emits. The server applies them
 * deterministically to the original message — the LLM never emits the
 * rewritten message itself, so the "silently drops a clause" failure mode
 * is impossible by construction.
 */
export type EditOp =
  | {
      op: 'canonicalize_mention';
      /** Where in the input the short reference appears. */
      sourceSpan: Span;
      /** Replacement canonical name. Must be one of knownNames. */
      canonical: string;
    }
  | {
      op: 'collapse_state_change';
      /** State-change verb phrase that should collapse to its result state. */
      sourceSpan: Span;
      /** Present-tense resulting-state phrase. */
      replacement: string;
    }
  | {
      op: 'strip_temporal';
      /** Temporal anchor span (paired with a corresponding asOf/validFrom). */
      sourceSpan: Span;
    };

export interface TemporalAnchor {
  iso: string;
  anchorSpan: Span;
}

export interface ChatRoute {
  intent: 'tell' | 'ask';
  /** Result of applying validated edits[] to the original message. Always
   *  populated — falls back to the original when no edits applied. */
  normalizedMessage: string;
  /** Ask-only: edits[] minus canonicalize_mention applied. The query for
   *  retrieval — temporal anchor stripped, state-change verbs collapsed,
   *  but entity NAMES untouched so the retrieval lexical match still sees
   *  the user's exact wording. */
  cleanedQuery?: string;
  /** Grounded entity references. canonical is always in knownNames; span
   *  is the substring of input that pointed at the entity. */
  mentions: Array<{ canonical: string; span: Span }>;
  /** Grounded predicate hints. predicateId is always in the registry
   *  snapshot; triggerSpan is the substring that warranted the hint. */
  predicateHints: Array<{ predicateId: string; triggerSpan: Span }>;
  /** Ask-only. Only set when the LLM produced a grounded anchor span. */
  asOf?: TemporalAnchor;
  /** Tell-only. Only set when the LLM produced a grounded anchor span. */
  validFrom?: TemporalAnchor;
  /** Free-text rationale the LLM gave — debug trace only. */
  reason?: string;
}

export interface ValidationReport {
  acceptedEdits: number;
  droppedEdits: Array<{ op: string; reason: string; span?: Span }>;
  acceptedMentions: number;
  droppedMentions: Array<{ canonical?: string; reason: string; span?: Span }>;
  acceptedHints: number;
  droppedHints: Array<{ predicateId?: string; reason: string; span?: Span }>;
  asOfStatus: 'grounded' | 'ungrounded' | 'absent';
  validFromStatus: 'grounded' | 'ungrounded' | 'absent';
}

const ASK_INTENT_VOCAB = ['tell', 'ask'] as const;

@Injectable()
export class ChatRouterService {
  private readonly logger = new Logger(ChatRouterService.name);
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly hintSimilarityThreshold: number;
  private readonly hintMaxCount: number;
  private readonly intentConfidenceFloor: number;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: PredicateRegistryService,
    private readonly routeCache: ChatRouterCacheService,
    private readonly embedder: EmbedderService,
    private readonly collapsePatterns: CollapsePatternService,
    private readonly intentClassifier: IntentClassifierService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
      timeout: 15_000,
      maxRetries: 1,
    });
    this.model = this.config.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o-mini');
    this.hintSimilarityThreshold = parseFloat(
      this.config.get<string>('CHAT_ROUTE_HINT_SIMILARITY', '0.4'),
    );
    this.hintMaxCount = parseInt(
      this.config.get<string>('CHAT_ROUTE_HINT_MAX', '3'),
      10,
    );
    this.intentConfidenceFloor = parseFloat(
      this.config.get<string>('CHAT_ROUTE_INTENT_CONFIDENCE_FLOOR', '0.85'),
    );
  }

  async route(
    message: string,
    options: { knownNames?: string[]; now?: Date; companyId: string },
  ): Promise<ChatRoute> {
    const nowIso = (options.now ?? new Date()).toISOString();
    const knownNames = options.knownNames ?? [];
    // Per-tenant predicate vocab for the LLM-side enum constraint.
    // Defensive: registry failure degrades to permissive — the strict-mode
    // enum drops to free string in that case (handled below).
    let snapshot: PredicateSnapshot | null = null;
    try {
      snapshot = await this.registry.getSnapshot(options.companyId);
    } catch (e) {
      this.logger.warn(
        `chat router: registry getSnapshot failed for ${options.companyId}: ${(e as Error).message}; falling back to permissive vocab`,
      );
    }
    const predicateVocab =
      snapshot?.active.map((p) => p.predicateId) ?? [];

    // Local pre-pass (deterministic, sub-ms). Replaces the LLM's job for
    // the two highest-coverage slots — temporal anchors and mention
    // resolution against the known-names whitelist. The LLM call still
    // runs for intent, predicateHints, and state-change edits, but its
    // output for asOf/validFrom/mentions is OVERRIDDEN by these local
    // results when they fire. Production memory systems (Zep Iris, mem0,
    // vLLM Semantic Router) all do this layering — see arxiv:2510.08731.
    const refDate = options.now ?? new Date();
    const localTemporal = extractTemporalLocally(message, refDate);
    const localMentions = extractMentionsLocally(message, knownNames);
    traceArtifact('demo.chat.local_planner', {
      temporal: localTemporal,
      mentions: localMentions,
      knownNamesCount: knownNames.length,
    });

    // Exact-key route cache. Hit replays a prior validated ChatRoute whose
    // spans are anchored to a byte-identical message (NFC is part of the
    // key), so spans remain valid without re-validation. nowDayBucket
    // only enters the key when the message carries a temporal anchor —
    // queries without "yesterday"/"next month" don't depend on `now`.
    const cacheKey = this.routeCache.computeKey({
      companyId: options.companyId,
      message,
      knownNames,
      predicateVocab,
      hasTemporal: localTemporal !== null,
      now: refDate,
    });
    const cached = this.routeCache.get(cacheKey);
    if (cached) {
      traceArtifact('demo.chat.cache_decision', {
        hit: true,
        key: cacheKey,
        hasTemporal: localTemporal !== null,
      });
      return cached;
    }
    traceArtifact('demo.chat.cache_decision', {
      hit: false,
      key: cacheKey,
      hasTemporal: localTemporal !== null,
    });

    // Embedding-based predicate-hint pre-pass. The registry's per-predicate
    // embeddings (already stored at bootstrap for EDC canonicalisation —
    // see migration 0012) are reused here: cosine(query, predicate.embedding)
    // ≥ threshold → emit a hint. Multilingual for free (embedder handles
    // RU + EN). No hardcoded phrase tables — the only knobs are similarity
    // threshold and top-N cap. ~50ms cache-miss cost; cache hits skip
    // this entirely.
    const localHints = await extractPredicateHintsLocally(
      message,
      snapshot,
      this.embedder,
      this.hintSimilarityThreshold,
      this.hintMaxCount,
    );
    traceArtifact('demo.chat.local_hints', {
      hints: localHints,
      threshold: this.hintSimilarityThreshold,
      poolSize: snapshot?.embeddings.size ?? 0,
    });

    // Learned collapse-pattern lookup. The per-tenant cache starts empty
    // and fills as the LLM emits collapse_state_change edits — first
    // observation pays the LLM round-trip; subsequent identical phrases
    // are derived locally. Sub-ms substring scan. Skipped on cache hit.
    let collapseSnapshot: { patterns: Map<string, { pattern: string; replacement: string }> } | null = null;
    let localCollapses: ReturnType<typeof extractCollapseEditsLocally> = [];
    try {
      collapseSnapshot = await this.collapsePatterns.getSnapshot(
        options.companyId,
      );
      localCollapses = extractCollapseEditsLocally(message, collapseSnapshot);
    } catch (e) {
      this.logger.warn(
        `collapse-pattern snapshot failed for ${options.companyId}: ${(e as Error).message}; LLM-only collapse`,
      );
    }
    traceArtifact('demo.chat.local_collapses', {
      hits: localCollapses,
      poolSize: collapseSnapshot?.patterns.size ?? 0,
    });

    // Intent classification — multilingual zero-shot NLI when the
    // model is warm, punctuation fallback otherwise. Runs only on cache
    // miss; cache hits skip the inference cost.
    const localIntent = await this.intentClassifier.classify(message);
    traceArtifact('demo.chat.local_intent', {
      intent: localIntent.intent,
      confidence: localIntent.confidence,
      source: localIntent.source,
    });

    const system = buildSystemPrompt(predicateVocab, knownNames);
    const user = `now: ${nowIso}
message: ${message}`;

    const skipDecision = shouldSkipLLM({
      intent: localIntent.intent,
      intentConfidence: localIntent.confidence,
      localMentions,
      localHints,
      localCollapses,
      intentConfidenceFloor: this.intentConfidenceFloor,
    });

    return traceSpan('demo.chat.route', async () => {
      traceArtifact('demo.chat.skip_decision', {
        ...skipDecision,
        intent: localIntent.intent,
        intentConfidence: localIntent.confidence,
        intentSource: localIntent.source,
        intentConfidenceFloor: this.intentConfidenceFloor,
      });

      if (skipDecision.skip) {
        // Build the same RawRouteOutput shape the LLM would have produced,
        // entirely from locals. validateAndAssemble runs unchanged — it
        // can't distinguish synthesised from LLM-emitted output once it's
        // in this shape, so every grounding rule still fires.
        const synthetic: RawRouteOutput = {
          intent: localIntent.intent,
          mentions: localMentions.map((m) => ({
            canonical: m.canonical,
            nameSpan: m.span,
          })),
          predicateHints:
            localIntent.intent === 'ask'
              ? localHints.map((h) => ({
                  predicateId: h.predicateId,
                  triggerSpan: h.triggerSpan,
                }))
              : [],
          edits: localCollapses.map((c) => ({
            op: 'collapse_state_change' as const,
            sourceSpan: c.span,
            canonical: null,
            replacement: c.replacement,
          })),
          asOf:
            localIntent.intent === 'ask' && localTemporal
              ? { iso: localTemporal.iso, anchorSpan: localTemporal.span }
              : null,
          validFrom:
            localIntent.intent === 'tell' && localTemporal
              ? { iso: localTemporal.iso, anchorSpan: localTemporal.span }
              : null,
          reason: `local-skip (${skipDecision.reason})`,
        };
        const route = this.validateAndAssemble(
          message,
          synthetic,
          new Set(predicateVocab),
          new Set(knownNames),
        );
        this.routeCache.set(cacheKey, route);
        return route;
      }

      traceArtifact('demo.chat.prompt', {
        system,
        user,
        model: this.model,
        registryVersionHash: snapshot?.versionHash ?? 'unavailable',
        predicateCount: predicateVocab.length,
        knownNamesCount: knownNames.length,
      });
      const res = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'chat_route',
            strict: true,
            schema: buildSchema(predicateVocab),
          },
        },
        temperature: 0,
        max_completion_tokens: 800,
      });
      const content = res.choices[0]?.message?.content;
      const finish = res.choices[0]?.finish_reason;
      traceArtifact('demo.chat.raw', { content, finish_reason: finish });
      if (!content) {
        return this.safeDefault(
          message,
          `router-empty (finish=${finish ?? 'unknown'})`,
        );
      }
      let parsed: RawRouteOutput;
      try {
        parsed = JSON.parse(extractJsonObject(content)) as RawRouteOutput;
      } catch (e) {
        this.logger.warn(
          `chat router parse failed: ${(e as Error).message}; raw="${content.slice(0, 200)}"`,
        );
        return this.safeDefault(message, `router-parse: ${(e as Error).message}`);
      }
      // Override LLM output with local-planner results where they fired —
      // chrono is faster + multilingual + deterministic, lexical mention
      // match is sub-ms + always correct against the whitelist. We trust
      // them over the LLM. The LLM still informs intent / predicateHints /
      // collapse_state_change edits.
      const merged: RawRouteOutput = { ...parsed };
      if (localMentions.length > 0) {
        merged.mentions = localMentions.map((m) => ({
          canonical: m.canonical,
          nameSpan: m.span,
        }));
      }
      if (parsed.intent === 'ask' && localTemporal) {
        merged.asOf = {
          iso: localTemporal.iso,
          anchorSpan: localTemporal.span,
        };
      } else if (parsed.intent === 'tell' && localTemporal) {
        merged.validFrom = {
          iso: localTemporal.iso,
          anchorSpan: localTemporal.span,
        };
      }
      // Predicate hints — union of local (embedding-based) + LLM, deduped
      // by predicateId with local span winning. Augment (not replace)
      // because the embedding pass is not exhaustive against the registry:
      // a paraphrase the embedding misses might still register with the
      // LLM and vice-versa. Only relevant on ASK; on TELL the slot is
      // empty by validation rule.
      if (parsed.intent === 'ask' && localHints.length > 0) {
        const llmHints = parsed.predicateHints ?? [];
        const localIds = new Set(localHints.map((h) => h.predicateId));
        merged.predicateHints = [
          ...localHints.map((h) => ({
            predicateId: h.predicateId,
            triggerSpan: h.triggerSpan,
          })),
          ...llmHints.filter((h) => !localIds.has(h.predicateId)),
        ];
      }
      // Inject local collapse edits into the LLM-emitted edits before
      // validation. validateAndAssemble's overlap-dedup handles any
      // double-emission (local cache hit + LLM re-emit on same phrase).
      if (localCollapses.length > 0) {
        merged.edits = [
          ...localCollapses.map((c) => ({
            op: 'collapse_state_change' as const,
            sourceSpan: c.span,
            canonical: null,
            replacement: c.replacement,
          })),
          ...(parsed.edits ?? []),
        ];
      }
      const route = this.validateAndAssemble(
        message,
        merged,
        new Set(predicateVocab),
        new Set(knownNames),
      );
      this.routeCache.set(cacheKey, route);

      // Fire-and-forget: teach the cache patterns the LLM emitted that
      // we didn't already know. Failure here doesn't affect routing —
      // the cache will just stay cold for those phrases.
      const knownLower = new Set(collapseSnapshot?.patterns.keys() ?? []);
      const newPairs: Array<{ pattern: string; replacement: string }> = [];
      for (const e of parsed.edits ?? []) {
        if (e.op !== 'collapse_state_change') continue;
        const span = validateSpan(message, nfc(message), e.sourceSpan);
        if (!span || !e.replacement) continue;
        const pattern = span.text;
        if (knownLower.has(pattern.toLowerCase())) continue;
        newPairs.push({ pattern, replacement: e.replacement });
      }
      if (newPairs.length > 0) {
        void this.collapsePatterns
          .record(options.companyId, newPairs)
          .catch((e) =>
            this.logger.warn(
              `collapse-pattern record failed for ${options.companyId}: ${(e as Error).message}`,
            ),
          );
      }
      return route;
    });
  }

  /**
   * Server-side validation pipeline. Each slot degrades independently — a
   * failed asOf becomes absent, a failed mention is dropped, a failed edit
   * is skipped. The route ALWAYS returns SOMETHING; downstream never 500s
   * on a partial validation failure.
   */
  private validateAndAssemble(
    message: string,
    parsed: RawRouteOutput,
    vocab: Set<string>,
    knownNames: Set<string>,
  ): ChatRoute {
    const normalizedInput = nfc(message);
    const report: ValidationReport = {
      acceptedEdits: 0,
      droppedEdits: [],
      acceptedMentions: 0,
      droppedMentions: [],
      acceptedHints: 0,
      droppedHints: [],
      asOfStatus: 'absent',
      validFromStatus: 'absent',
    };

    // 1. Mentions — every mention's nameSpan must ground; canonical must
    //    be in knownNames (or null = unrecognised entity, dropped).
    const mentions: Array<{ canonical: string; span: Span }> = [];
    for (const m of parsed.mentions ?? []) {
      const span = validateSpan(message, normalizedInput, m.nameSpan);
      if (!span) {
        report.droppedMentions.push({
          canonical: m.canonical ?? undefined,
          reason: 'ungrounded',
          span: m.nameSpan,
        });
        continue;
      }
      if (!m.canonical || !knownNames.has(m.canonical)) {
        report.droppedMentions.push({
          canonical: m.canonical ?? undefined,
          reason: 'not_in_known_names',
          span,
        });
        continue;
      }
      mentions.push({ canonical: m.canonical, span });
      report.acceptedMentions++;
    }

    // 2. Predicate hints — triggerSpan grounds + predicateId ∈ vocab.
    const predicateHints: Array<{ predicateId: string; triggerSpan: Span }> = [];
    if (parsed.intent === 'ask') {
      for (const h of parsed.predicateHints ?? []) {
        const span = validateSpan(message, normalizedInput, h.triggerSpan);
        if (!span) {
          report.droppedHints.push({
            predicateId: h.predicateId,
            reason: 'ungrounded',
            span: h.triggerSpan,
          });
          continue;
        }
        if (vocab.size > 0 && !vocab.has(h.predicateId)) {
          report.droppedHints.push({
            predicateId: h.predicateId,
            reason: 'not_in_vocab',
            span,
          });
          continue;
        }
        predicateHints.push({
          predicateId: h.predicateId,
          triggerSpan: span,
        });
        report.acceptedHints++;
      }
    }

    // 3. Temporal anchors — both asOf and validFrom must have a grounded
    //    anchor span AND a valid ISO timestamp to survive. Cross-field
    //    consistency: tell carries validFrom only; ask carries asOf only.
    let asOf: TemporalAnchor | undefined;
    if (parsed.intent === 'ask' && parsed.asOf) {
      const span = validateSpan(
        message,
        normalizedInput,
        parsed.asOf.anchorSpan,
      );
      if (span && isValidIso(parsed.asOf.iso)) {
        asOf = { iso: parsed.asOf.iso, anchorSpan: span };
        report.asOfStatus = 'grounded';
      } else {
        report.asOfStatus = 'ungrounded';
      }
    }
    let validFrom: TemporalAnchor | undefined;
    if (parsed.intent === 'tell' && parsed.validFrom) {
      const span = validateSpan(
        message,
        normalizedInput,
        parsed.validFrom.anchorSpan,
      );
      if (span && isValidIso(parsed.validFrom.iso)) {
        validFrom = { iso: parsed.validFrom.iso, anchorSpan: span };
        report.validFromStatus = 'grounded';
      } else {
        report.validFromStatus = 'ungrounded';
      }
    }

    // 4. Edits — synthesise canonicalize_mention 1:1 from accepted
    //    mentions, then validate LLM-emitted collapse_state_change
    //    edits (sourceSpan must ground). Edits whose sourceSpan
    //    overlaps another accepted edit are dropped right-to-left so
    //    splicing remains coherent.
    const candidateEdits: Array<{ edit: EditOp; span: Span }> = mentions.map(
      (m) => ({
        edit: {
          op: 'canonicalize_mention' as const,
          sourceSpan: m.span,
          canonical: m.canonical,
        },
        span: m.span,
      }),
    );
    for (const e of parsed.edits ?? []) {
      const span = validateSpan(message, normalizedInput, e.sourceSpan);
      if (!span) {
        report.droppedEdits.push({
          op: e.op,
          reason: 'ungrounded',
          span: e.sourceSpan,
        });
        continue;
      }
      // Defensive: LLM schema only enumerates collapse_state_change.
      // Anything else (a non-strict deployment leaking
      // canonicalize_mention or strip_temporal) is dropped; both ops
      // are already server-synthesised.
      if (e.op !== 'collapse_state_change') {
        report.droppedEdits.push({
          op: e.op,
          reason: 'llm_emit_disabled',
          span,
        });
        continue;
      }
      candidateEdits.push({ edit: { ...e, sourceSpan: span }, span });
    }
    // Drop overlap: keep the first, drop any subsequent edit that overlaps.
    candidateEdits.sort((a, b) => a.span.start - b.span.start);
    const acceptedEdits: typeof candidateEdits = [];
    let lastEnd = -1;
    for (const c of candidateEdits) {
      if (c.span.start < lastEnd) {
        report.droppedEdits.push({
          op: c.edit.op,
          reason: 'overlaps_prior_edit',
          span: c.span,
        });
        continue;
      }
      acceptedEdits.push(c);
      lastEnd = c.span.end;
    }
    report.acceptedEdits = acceptedEdits.length;

    // 5. Auto-derive strip_temporal edits from grounded asOf/validFrom
    //    anchors. The LLM is supposed to emit these explicitly but is
    //    inconsistent — and the rule is mechanical anyway: if we captured
    //    the timestamp from a span, that span should be stripped from
    //    the message that flows downstream. Skip if the anchor would
    //    overlap a prior accepted edit.
    const autoStripEdits: EditOp[] = [];
    for (const anchor of [asOf?.anchorSpan, validFrom?.anchorSpan]) {
      if (!anchor) continue;
      const overlaps = acceptedEdits.some(
        (c) =>
          !(c.span.end <= anchor.start || c.span.start >= anchor.end),
      );
      if (overlaps) continue;
      autoStripEdits.push({ op: 'strip_temporal', sourceSpan: anchor });
    }
    const allEdits = [
      ...acceptedEdits.map((c) => c.edit),
      ...autoStripEdits,
    ];

    // 6. Apply edits right-to-left so earlier offsets stay valid as we
    //    splice. Produces normalizedMessage (all edits) and cleanedQuery
    //    (skip canonicalize_mention so retrieval lexical match keeps the
    //    user's wording).
    const normalizedMessage = applyEdits(message, allEdits, () => true);
    const cleanedQuery =
      parsed.intent === 'ask'
        ? applyEdits(
            message,
            allEdits,
            (op) => op !== 'canonicalize_mention',
          )
        : undefined;

    traceArtifact('demo.chat.validation', report);

    return {
      intent: parsed.intent,
      normalizedMessage,
      ...(cleanedQuery !== undefined && cleanedQuery !== message
        ? { cleanedQuery }
        : {}),
      mentions,
      predicateHints,
      ...(asOf ? { asOf } : {}),
      ...(validFrom ? { validFrom } : {}),
      ...(parsed.reason ? { reason: parsed.reason } : {}),
    };
  }

  /** Safe default when the LLM gave us nothing usable. Treat as a tell of
   *  the original message — ingest still happens, downstream pipeline
   *  doesn't 500. */
  private safeDefault(message: string, reason: string): ChatRoute {
    this.logger.warn(`chat router defaulting: ${reason}`);
    const fallback: ChatRoute = {
      intent: 'tell',
      normalizedMessage: message,
      mentions: [],
      predicateHints: [],
      reason,
    };
    traceArtifact('demo.chat.route', fallback);
    return fallback;
  }
}

// ── Prompt + schema builders ─────────────────────────────────────────────

function buildSystemPrompt(
  predicateVocab: string[],
  knownNames: string[],
): string {
  return `You route a free-form chat message to a knowledge-graph backend.

THE GROUNDING RULE (most important):
  Every field you return that points into the user's message — every span
  (mentions, predicate-hint triggers, edit source-spans, temporal anchors)
  — MUST be a VERBATIM substring of the message. Each span is an object
  { "text": "...", "start": N, "end": N } where text equals
  message.slice(start, end) character-for-character. The server validates
  every span and DROPS any field whose span doesn't ground.

  If you cannot quote the words of the input that warrant a slot, return
  null / empty for that slot. Do NOT default. Do NOT paraphrase. Do NOT
  rewrite the message into a free-text string anywhere in your output —
  rewrites are expressed as structured edit operations applied
  deterministically by the server.

OUTPUT CONTRACT (strict JSON schema enforces shape):

  intent: "tell" | "ask"
    tell  = the user is asserting a fact (declarative).
    ask   = the user is asking a question (interrogative or imperative search).

  mentions[]: entities the message names that match a known canonical name.
    { canonical: <one of knownNames>, nameSpan: <Span pointing at the short
                                                  reference in the input> }
    Use this for "Maria" → "Maria Petrov" (when Maria Petrov is in knownNames).
    canonical=null when the entity isn't in knownNames — the server drops
    those.

  predicateHints[] (ask only — empty array on tell): closed-vocab predicates
    the question targets, each with the trigger phrase from the input.
      { predicateId: <one of registered predicates>,
        triggerSpan: <Span at "where lives", "what does X eat", etc.> }
    Common mappings:
      "where lives", "address", "лицо живёт", "где живёт"   → predicate: address
      "what eats", "preference", "что предпочитает"          → predicate: preference
      "what role", "is X the ...", "должность"               → predicate: status
      "what plans to", "wants to"                            → predicate: intent
      "email of"                                             → predicate: email

  edits[]: structured edit operations that the SERVER applies to the input
    message to produce the rewritten form. The model NEVER emits the rewritten
    string itself — only the edit ops.

    The server SYNTHESISES canonicalize_mention (1:1 from accepted mentions)
    and strip_temporal (1:1 from grounded temporal anchors) — do NOT emit
    them. Emit only:

      collapse_state_change: replace a change-of-state verb phrase with the
        present-tense resulting-state form. TENSE-AGNOSTIC — covers past,
        present, future.
        Examples: "switched to keto" → replacement "now prefers keto"
                  "moves to Dublin"  → replacement "lives in Dublin"
                  "joined as CTO"    → replacement "is the CTO"
                  "moved from Berlin"→ replacement "lives in Berlin"

    Apply edits ONLY when they are warranted by the input. Do not invent
    edits to make the message "cleaner" — every edit must point at a real
    substring AND have a clear purpose. Overlapping edits are dropped by
    the server.

  asOf (ask only, optional): { iso: <ISO 8601 relative to "now">,
                               anchorSpan: <Span at the temporal phrase> }
    Emit ONLY when the ask carries an explicit temporal anchor ("yesterday",
    "next month", "вчера", "in March"). NO ANCHOR → set asOf to null.
    Do NOT default to today or now.

  validFrom (tell only, optional): same shape as asOf.
    Emit when a tell carries an anchor for WHEN the fact became true
    ("switched to keto LAST MONTH", "next month moves to Dublin"). NO
    ANCHOR → null. Bare "now" is null.

  reason (optional): one-sentence rationale for the trace.

KNOWN CANONICAL NAMES in the graph:
${JSON.stringify(knownNames)}

REGISTERED PREDICATES in the vocabulary:
${JSON.stringify(predicateVocab)}
`;
}

function buildSchema(predicateVocab: string[]): Record<string, unknown> {
  const spanSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string' },
      start: { type: 'integer', minimum: 0 },
      end: { type: 'integer', minimum: 0 },
    },
    required: ['text', 'start', 'end'],
  };
  const predicateField =
    predicateVocab.length > 0
      ? { type: 'string', enum: predicateVocab }
      : { type: 'string' };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: { type: 'string', enum: [...ASK_INTENT_VOCAB] },
      mentions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            canonical: { type: ['string', 'null'] },
            nameSpan: spanSchema,
          },
          required: ['canonical', 'nameSpan'],
        },
      },
      predicateHints: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            predicateId: predicateField,
            triggerSpan: spanSchema,
          },
          required: ['predicateId', 'triggerSpan'],
        },
      },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            // canonicalize_mention is server-synthesised 1:1 from
            // accepted mentions[]. strip_temporal is server-derived from
            // grounded asOf/validFrom anchors. LLM only owns
            // collapse_state_change.
            op: {
              type: 'string',
              enum: ['collapse_state_change'],
            },
            sourceSpan: spanSchema,
            canonical: { type: ['string', 'null'] },
            replacement: { type: ['string', 'null'] },
          },
          required: ['op', 'sourceSpan', 'canonical', 'replacement'],
        },
      },
      asOf: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              iso: { type: 'string' },
              anchorSpan: spanSchema,
            },
            required: ['iso', 'anchorSpan'],
          },
        ],
      },
      validFrom: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              iso: { type: 'string' },
              anchorSpan: spanSchema,
            },
            required: ['iso', 'anchorSpan'],
          },
        ],
      },
      reason: { type: ['string', 'null'] },
    },
    required: [
      'intent',
      'mentions',
      'predicateHints',
      'edits',
      'asOf',
      'validFrom',
      'reason',
    ],
  };
}

// ── Validation helpers ──────────────────────────────────────────────────

interface RawSpan {
  text: string;
  start: number;
  end: number;
}

interface RawRouteOutput {
  intent: 'tell' | 'ask';
  mentions?: Array<{ canonical: string | null; nameSpan: RawSpan }>;
  predicateHints?: Array<{ predicateId: string; triggerSpan: RawSpan }>;
  edits?: Array<{
    op: 'canonicalize_mention' | 'collapse_state_change' | 'strip_temporal';
    sourceSpan: RawSpan;
    canonical: string | null;
    replacement: string | null;
  }>;
  asOf: { iso: string; anchorSpan: RawSpan } | null;
  validFrom: { iso: string; anchorSpan: RawSpan } | null;
  reason: string | null;
}

/** NFC normalization — keeps the multi-byte cases (Cyrillic combining
 *  marks, EN-vs-RU quotes) from breaking offset arithmetic. */
function nfc(s: string): string {
  return s.normalize('NFC');
}

/**
 * Validate a span against the input. Three levels:
 *   1. Exact: original.slice(start,end) === text
 *   2. NFC-equivalent: nfc(original).slice(start,end) === nfc(text)
 *   3. Repair: find the first occurrence of nfc(text) in nfc(original),
 *      synthesize offsets. Logs but accepts.
 *
 * Returns the validated Span with possibly-repaired offsets, or null if
 * no level matched.
 */
function validateSpan(
  original: string,
  normalizedOriginal: string,
  raw: RawSpan | undefined | null,
): Span | null {
  if (!raw || typeof raw.text !== 'string') return null;
  if (raw.text.trim().length === 0) return null;
  const { text, start, end } = raw;
  if (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end <= original.length &&
    start < end &&
    original.slice(start, end) === text
  ) {
    return { text, start, end };
  }
  const normalizedText = nfc(text);
  if (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end <= normalizedOriginal.length &&
    start < end &&
    normalizedOriginal.slice(start, end) === normalizedText
  ) {
    return { text, start, end };
  }
  const idx = normalizedOriginal.indexOf(normalizedText);
  if (idx >= 0) {
    return { text, start: idx, end: idx + normalizedText.length };
  }
  return null;
}

/**
 * Apply edits[] right-to-left so earlier offsets remain valid as we splice.
 * filterOp selects which edits to apply — used to derive cleanedQuery by
 * skipping canonicalize_mention edits.
 */
function applyEdits(
  original: string,
  edits: EditOp[],
  filterOp: (op: EditOp['op']) => boolean,
): string {
  const applicable = edits
    .filter((e) => filterOp(e.op))
    .sort((a, b) => b.sourceSpan.start - a.sourceSpan.start);
  let working = original;
  for (const e of applicable) {
    const { start, end } = e.sourceSpan;
    const replacement =
      e.op === 'canonicalize_mention'
        ? e.canonical
        : e.op === 'collapse_state_change'
          ? e.replacement
          : ''; // strip_temporal
    working =
      working.slice(0, start) + replacement + working.slice(end);
  }
  // Collapse any double-spaces strip_temporal left behind.
  return working.replace(/\s+/g, ' ').trim();
}

// ── Local planners (deterministic, sub-ms, replace the LLM for the
//    highest-coverage routing slots) ──────────────────────────────────

/**
 * Temporal anchor extraction via chrono-node. Handles EN + RU + common
 * code-switched cases at 1-5ms (vs gpt-4o-mini's 1-3s). Returns the
 * first parsed result with its character span — the same shape the
 * LLM would have produced.
 *
 * chrono-node coverage: yesterday / next month / in March / last week
 * / 3 days ago / вчера / в марте / на прошлой неделе / через неделю /
 * следующий месяц. Failure modes (implicit anchors like "when I get
 * back") fall through to the LLM via the merge in route().
 */
function extractTemporalLocally(
  message: string,
  ref: Date,
): { iso: string; span: { text: string; start: number; end: number } } | null {
  try {
    // Use chrono.casual which is more permissive than strict; covers
    // both EN and (limited) RU via the default parsers.
    const results = chrono.parse(message, ref, { forwardDate: false });
    if (!results || results.length === 0) return null;
    const first = results[0];
    const date = first.start?.date?.();
    if (!date || Number.isNaN(date.getTime())) return null;
    const text = first.text;
    const start = first.index;
    const end = start + text.length;
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      start < 0 ||
      end > message.length ||
      message.slice(start, end) !== text
    ) {
      return null;
    }
    return { iso: date.toISOString(), span: { text, start, end } };
  } catch {
    return null;
  }
}

/**
 * Lexical mention resolution against the per-tenant knownNames list.
 * Matches canonical names AND first-name aliases by case-insensitive
 * substring — covers the "Maria" → "Maria Petrov" canonicalisation
 * without an LLM call. Sub-millisecond at demo scale (≤200 names).
 *
 * Returns each match with its grounded span (offset into the original
 * message) so the validateAndAssemble pipeline accepts it directly.
 *
 * Future: Aho-Corasick for tenants with N>200 names (one trie scan vs
 * N substring searches).
 */
function extractMentionsLocally(
  message: string,
  knownNames: string[],
): Array<{
  canonical: string;
  span: { text: string; start: number; end: number };
}> {
  if (knownNames.length === 0) return [];
  const lowerMessage = message.toLowerCase();
  const accepted: Array<{
    canonical: string;
    span: { text: string; start: number; end: number };
  }> = [];
  const occupied: Array<[number, number]> = [];
  // Match longest canonical names first ("Maria Petrov" before "Maria")
  // so the full form wins when both substrings are present.
  const namesByLength = [...knownNames].sort((a, b) => b.length - a.length);
  for (const canonical of namesByLength) {
    const needle = canonical.toLowerCase();
    if (needle.length < 2) continue;
    let from = 0;
    while (from < lowerMessage.length) {
      const idx = lowerMessage.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      const overlaps = occupied.some(
        ([s, e]) => !(end <= s || idx >= e),
      );
      if (!overlaps) {
        accepted.push({
          canonical,
          span: { text: message.slice(idx, end), start: idx, end },
        });
        occupied.push([idx, end]);
      }
      from = end;
    }
    // Also match the FIRST token of the canonical name (e.g. "Maria"
    // for "Maria Petrov") — covers short-reference canonicalisation
    // without the LLM. Only when the canonical has multiple tokens AND
    // no other knownName collides on the first token (ambiguous case;
    // leave it to the LLM).
    const tokens = canonical.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      const firstToken = tokens[0];
      const collides = knownNames.some(
        (other) =>
          other !== canonical &&
          other.toLowerCase().startsWith(firstToken.toLowerCase() + ' '),
      );
      if (!collides) {
        const needle2 = firstToken.toLowerCase();
        if (needle2.length >= 2) {
          let from2 = 0;
          while (from2 < lowerMessage.length) {
            const idx = lowerMessage.indexOf(needle2, from2);
            if (idx < 0) break;
            const end = idx + needle2.length;
            // Word-boundary check so "Mariana" isn't matched as "Maria".
            const before = idx > 0 ? message[idx - 1] : ' ';
            const after = end < message.length ? message[end] : ' ';
            const isWordChar = (c: string) => /[\p{L}\p{N}]/u.test(c);
            if (!isWordChar(before) && !isWordChar(after)) {
              const overlaps = occupied.some(
                ([s, e]) => !(end <= s || idx >= e),
              );
              if (!overlaps) {
                accepted.push({
                  canonical,
                  span: { text: message.slice(idx, end), start: idx, end },
                });
                occupied.push([idx, end]);
              }
            }
            from2 = end;
          }
        }
      }
    }
  }
  return accepted;
}

/**
 * Embedding-based predicate-hint extraction.
 *
 * Compares the user message embedding against the per-predicate
 * embeddings already stored by the registry (each predicate is embedded
 * at bootstrap as part of the EDC pipeline — see migration 0012). Emits
 * a hint for every predicate whose cosine similarity ≥ threshold, capped
 * at maxHints, ranked by similarity descending.
 *
 * triggerSpan covers the whole message — the embedding aggregates over
 * all tokens, so there is no localized phrase to anchor. The trace
 * artifact carries the similarity score so an operator can see what
 * earned the hint and tune the threshold.
 *
 * Cost: ~50ms per cache miss (one OpenAI embedding round-trip; the
 * embedder's LRU cache absorbs repeated identical queries). Skipped
 * entirely on cache hit because this runs AFTER the cache check.
 *
 * Failure modes degrade silently to empty hints — the LLM still produces
 * its own hints and the validation pipeline handles missing slots.
 */
export async function extractPredicateHintsLocally(
  message: string,
  snapshot: PredicateSnapshot | null,
  embedder: EmbedderService,
  threshold: number,
  maxHints: number,
): Promise<
  Array<{
    predicateId: string;
    similarity: number;
    triggerSpan: Span;
  }>
> {
  if (!snapshot || snapshot.embeddings.size === 0) return [];
  if (message.length === 0) return [];
  let queryVec: number[];
  try {
    queryVec = await embedder.embed(message);
  } catch {
    return [];
  }
  const scored: Array<{ predicateId: string; similarity: number }> = [];
  for (const [predicateId, predEmb] of snapshot.embeddings) {
    const sim = cosineSimilarity(queryVec, predEmb);
    if (sim >= threshold) {
      scored.push({ predicateId, similarity: sim });
    }
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  const span: Span = { text: message, start: 0, end: message.length };
  return scored.slice(0, maxHints).map(({ predicateId, similarity }) => ({
    predicateId,
    similarity,
    triggerSpan: span,
  }));
}

/**
 * Local intent classifier — punctuation-only.
 *
 * The only signal is the universal interrogative mark `?`. No
 * enumerated lexicon of wh-pronouns, no list of imperative-search
 * phrases — those are surface-form catalogues that rot per language
 * and read as magic in code.
 *
 * Confidence levels feed the LLM-skip gate:
 *   trailing `?`  → ask, 0.95 (unambiguous interrogative mark)
 *   otherwise     → tell, 0.70 (declarative default; below the skip
 *                              floor unless a tenant explicitly lowers
 *                              CHAT_ROUTE_INTENT_CONFIDENCE_FLOOR)
 *   empty         → tell, 0    (never skip)
 *
 * Trade-off: a wh-question typed without `?` ("where Maria lives")
 * defaults to tell-fallback and the LLM runs. That is the LLM's job —
 * it is the safety net for everything heuristics cannot decide.
 * Aggressive multilingual intent classification (zero-shot NLI via
 * @xenova/transformers) is the upgrade path when warm-start cost is
 * acceptable; deferred until it materially shifts the skip rate.
 */
export function classifyIntentLocally(message: string): {
  intent: 'ask' | 'tell';
  confidence: number;
} {
  if (message.trim().length === 0) {
    return { intent: 'tell', confidence: 0 };
  }
  if (/\?\s*$/.test(message)) {
    return { intent: 'ask', confidence: 0.95 };
  }
  return { intent: 'tell', confidence: 0.7 };
}

/**
 * Confidence-gated decision: can we serve this route entirely from
 * local pre-pass and skip the LLM call?
 *
 * Conservative gates: each check must pass or we fall through to the
 * LLM (the LLM is the safety net for everything heuristics can't cover).
 *   - intent confidence ≥ 0.85
 *   - at least one mention resolved (otherwise the route lacks subject)
 *   - ASK: at least one predicate hint emitted (otherwise we'd guess
 *     what the question targets)
 *   - TELL: at least one cached collapse edit fired (otherwise we'd
 *     risk shipping a tell with a state-change verb left raw —
 *     downstream extraction reads it as past-tense, missing the
 *     present-state fact). Simple tells with no state-change pass
 *     through the route cache on second occurrence anyway, so the
 *     cost of LLM-on-first-occurrence is bounded.
 *
 * Temporal slot does not gate: if a message has a temporal cue
 * chrono can parse, localTemporal is set and the synthesis includes
 * it; if chrono parses nothing, we treat the message as anchor-less
 * (matches "no asOf default" rule in the system prompt).
 */
export function shouldSkipLLM(input: {
  intent: 'ask' | 'tell';
  intentConfidence: number;
  localMentions: Array<{ canonical: string; span: Span }>;
  localHints: Array<{ predicateId: string; similarity: number; triggerSpan: Span }>;
  localCollapses: Array<{
    pattern: string;
    replacement: string;
    span: { text: string; start: number; end: number };
  }>;
  intentConfidenceFloor: number;
}): { skip: boolean; reason: string } {
  if (input.intentConfidence < input.intentConfidenceFloor) {
    return { skip: false, reason: 'intent_confidence_low' };
  }
  if (input.localMentions.length === 0) {
    return { skip: false, reason: 'no_mentions_resolved' };
  }
  if (input.intent === 'ask') {
    if (input.localHints.length === 0) {
      return { skip: false, reason: 'no_predicate_hints' };
    }
    return { skip: true, reason: 'all_local_ask' };
  }
  if (input.localCollapses.length === 0) {
    return { skip: false, reason: 'tell_no_cached_collapses' };
  }
  return { skip: true, reason: 'all_local_tell' };
}

function isValidIso(s: string): boolean {
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

/**
 * Extracts the first balanced top-level JSON object from a possibly noisy
 * LLM output. Handles leading sentinel tokens, markdown code fences,
 * trailing prose.
 */
function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const inner = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const start = inner.indexOf('{');
  if (start < 0) throw new Error('no JSON object found in router response');
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < inner.length; i++) {
    const c = inner[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return inner.slice(start, i + 1);
    }
  }
  throw new Error('unterminated JSON object in router response');
}

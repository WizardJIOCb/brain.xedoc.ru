import { spawn, ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export interface SpawnedService {
  baseUrl: string;
  apiKey: string;
  companyId: string;
  proc: ChildProcess;
  stop: () => Promise<void>;
}

/**
 * Best-effort load of OPENAI_API_KEY from process.env, then from a sibling
 * .env file in another local repo (development convenience). The real e2e
 * suite refuses to run without it.
 */
function loadOpenAiKey(): string {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const candidates = [
    '/Users/mikefluff/Documents/initeai/.env',
    '/Users/mikefluff/Documents/figma/.env',
    '/Users/mikefluff/Documents/mikefluff-site/.env',
    '/Users/mikefluff/Documents/mcp-second-brain/.env',
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf-8');
    const m = content.match(/^OPENAI_API_KEY=(.+)$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  throw new Error(
    'OPENAI_API_KEY not in env and no fallback .env found. Set it before running real e2e.',
  );
}

async function waitForHealth(baseUrl: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        const body = (await res.json()) as { checks?: { surrealdb?: string } };
        if (body.checks?.surrealdb === 'ok') return;
      }
    } catch {
      // not up yet
    }
    await delay(250);
  }
  throw new Error(`Service did not become healthy within ${timeoutMs}ms`);
}

export async function spawnService(opts: {
  port?: number;
  scopes?: string[];
} = {}): Promise<SpawnedService> {
  const port = opts.port ?? (40_000 + Math.floor(Math.random() * 20_000));
  const companyId = `co_real_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const apiKey = `key_${randomUUID()}`;
  const keyHash =
    'sha256:' + createHash('sha256').update(apiKey).digest('hex');
  const apiKeys = JSON.stringify([
    {
      keyHash,
      companyId,
      scopes: opts.scopes ?? [
        'brain:read',
        'brain:write',
        'brain:admin',
        'brain:read_pii',
      ],
    },
  ]);

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'test',
    SURREALDB_URL: process.env.SURREALDB_URL!,
    SURREALDB_USERNAME: process.env.SURREALDB_USERNAME ?? 'root',
    SURREALDB_PASSWORD: process.env.SURREALDB_PASSWORD ?? 'root',
    SURREALDB_NAMESPACE: 'brain',
    OPENAI_API_KEY: loadOpenAiKey(),
    OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
    OPENAI_EMBEDDING_DIMENSIONS: '1536',
    OPENAI_CHAT_MODEL: 'gpt-4o-mini',
    BRAIN_API_KEYS: apiKeys,
  };

  const repoRoot = join(__dirname, '..');
  const proc = spawn('node', [join(repoRoot, 'dist', 'main.js')], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Mirror stderr only on failure to keep test output tidy.
  let stderr = '';
  proc.stderr?.on('data', (d) => {
    stderr += d.toString();
  });
  proc.stdout?.on('data', () => {
    /* swallow */
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(baseUrl);
  } catch (err) {
    proc.kill('SIGKILL');
    throw new Error(
      `Service failed to start.\nstderr:\n${stderr.slice(-2000)}\n\nRoot cause: ${(err as Error).message}`,
    );
  }

  return {
    baseUrl,
    apiKey,
    companyId,
    proc,
    stop: async () => {
      proc.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          proc.kill('SIGKILL');
          resolve();
        }, 5_000);
        proc.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    },
  };
}

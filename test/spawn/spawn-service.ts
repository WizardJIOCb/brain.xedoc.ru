import { ProcessManager } from './process-manager';
import { newBrainKey, newCompanyId, BrainKeySpec } from './key-factory';
import { loadOpenAiKey } from './openai-key-loader';
import { waitForHealth } from './health-waiter';

export interface SpawnedService {
  baseUrl: string;
  /** Primary key — full scopes by default. */
  primary: BrainKeySpec;
  /**
   * Optional additional keys requested by the test (e.g. a limited-scope
   * key on the same companyId for PII gating).
   */
  extras: BrainKeySpec[];
  companyId: string;
  stop: () => Promise<void>;
}

export interface SpawnOptions {
  port?: number;
  /** Scopes the primary key carries. Default: all scopes. */
  scopes?: string[];
  /** Additional keys with their own scopes — issued for the same tenant. */
  extraKeyScopes?: string[][];
}

const DEFAULT_SCOPES = [
  'brain:read',
  'brain:write',
  'brain:admin',
  'brain:read_pii',
];

export async function spawnService(opts: SpawnOptions = {}): Promise<SpawnedService> {
  const port = opts.port ?? 40_000 + Math.floor(Math.random() * 20_000);
  const companyId = newCompanyId();

  const primary = newBrainKey(companyId, opts.scopes ?? DEFAULT_SCOPES);
  const extras = (opts.extraKeyScopes ?? []).map((scopes) =>
    newBrainKey(companyId, scopes),
  );

  const allKeys = [primary, ...extras].map((k) => ({
    keyHash: k.keyHash,
    companyId: k.companyId,
    scopes: k.scopes,
  }));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'test',
    SURREALDB_URL: process.env.SURREALDB_URL,
    SURREALDB_USERNAME: process.env.SURREALDB_USERNAME ?? 'root',
    SURREALDB_PASSWORD: process.env.SURREALDB_PASSWORD ?? 'root',
    SURREALDB_NAMESPACE: 'brain',
    OPENAI_API_KEY: loadOpenAiKey(),
    OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
    OPENAI_EMBEDDING_DIMENSIONS: '1536',
    OPENAI_CHAT_MODEL: 'gpt-4o-mini',
    BRAIN_API_KEYS: JSON.stringify(allKeys),
    FORGET_HMAC_KEY: 'test-hmac-key-must-be-at-least-32-chars',
  };

  const manager = new ProcessManager();
  manager.start(env);

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(baseUrl);
  } catch (err) {
    await manager.stop();
    throw new Error(
      `Service failed to start.\nstderr:\n${manager
        .capturedStderr()
        .slice(-2000)}\n\nRoot cause: ${(err as Error).message}`,
    );
  }

  return {
    baseUrl,
    primary,
    extras,
    companyId,
    stop: () => manager.stop(),
  };
}

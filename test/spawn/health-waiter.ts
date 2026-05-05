import { setTimeout as delay } from 'node:timers/promises';

/**
 * Polls /health until it reports surrealdb=ok or the timeout elapses.
 */
export async function waitForHealth(baseUrl: string, timeoutMs = 30_000): Promise<void> {
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

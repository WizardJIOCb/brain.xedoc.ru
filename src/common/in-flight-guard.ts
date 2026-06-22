/**
 * Per-key reentrancy guard for cron handlers. If a previous tick is
 * still running for the same key, the new tick becomes a no-op and
 * returns the deferred `Promise<null>`. Caller decides whether to
 * await — most cron methods don't because the @nestjs/schedule loop
 * doesn't care about the return value.
 *
 * Why: DreamsService, CompactionService, CalibrationRefitService run
 * daily and CAN exceed their 24h budget under load (multi-tenant
 * fan-out × LLM judge × per-query timeouts). Without a guard, two
 * instances on the same tenant pile RELATE rows with different
 * createdAt timestamps — RACE bug in identity-link dedup.
 *
 * The map is process-local; on multi-pod deploy this needs to lift
 * into a distributed lock (k8s Lease / Surreal CAS). For now we ship
 * single-pod with a TODO at the call sites.
 */
export class InFlightGuard {
  private readonly active = new Map<string, Promise<unknown>>();

  /**
   * Run `fn` exclusively for `key`. Re-entries while a previous fn
   * is running return null without invoking fn again.
   *
   * Contract caveat: `null` is the "skipped — already running" sentinel,
   * so it is AMBIGUOUS with an `fn` that itself resolves `null`. Callers
   * that branch on `=== null` to detect a skip MUST therefore use an `fn`
   * whose own success value is never `null` (return a result object/`void`
   * sentinel instead). All current callers (dreams, calibration-refit)
   * satisfy this.
   */
  async run<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
    if (this.active.has(key)) return null;
    const p = (async () => fn())();
    this.active.set(key, p);
    try {
      return await p;
    } finally {
      this.active.delete(key);
    }
  }

  isActive(key: string): boolean {
    return this.active.has(key);
  }
}

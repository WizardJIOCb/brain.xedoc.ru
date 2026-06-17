/**
 * Conformal-style confidence guardrail for the synthesize pipeline.
 *
 * Phase 3.C of the must-have memory upgrade. References:
 *   - Conformal Linguistic Calibration (arXiv:2502.19110, 2025)
 *   - ConU: Conformal Uncertainty in LLMs (arXiv:2407.00499, 2024)
 *
 * The full conformal-prediction machinery gives a (1 - α) coverage
 * guarantee on a calibration set. We adopt the pragmatic form: every
 * SearchHit fact carries a `breakdown.calibratedConfidence` set by the
 * Phase 3.A isotonic map; the guardrail drops facts whose calibrated
 * value is below a configurable floor *before* the generator sees them
 * as citation targets. Facts above the floor remain in the response so
 * the caller can still see them (DecisionLog continues to attribute
 * them — they just don't enter the prompt as ground-truth evidence).
 *
 * Pure module — no DI, no IO. The synthesize service calls
 * `applyConformalGuardrail()` between fact-index construction and
 * the generator call.
 */

import type { SearchHit } from '../search/search.types';

export interface ConformalGuardrailConfig {
  /**
   * Minimum calibrated confidence a fact must have to be eligible as
   * a citation target. 0 = guardrail disabled (every fact eligible).
   * Default for the synthesize service is 0 to preserve back-compat;
   * production deployments override via `SYNTHESIZE_MIN_CONFIDENCE`.
   */
  minCalibratedConfidence: number;
}

export interface ConformalGuardrailResult {
  /** Facts that passed the floor. Same SearchHit shape, just filtered. */
  kept: SearchHit[];
  /** Number of individual facts dropped, summed across all entities. */
  droppedCount: number;
}

/**
 * Drop SearchHit facts whose `breakdown.calibratedConfidence` falls
 * below `cfg.minCalibratedConfidence`. SearchHits that end up with
 * zero remaining facts are removed entirely. Facts without a
 * breakdown are kept (defensive: we cannot judge a fact we can't
 * score, and the upstream may legitimately omit breakdowns for
 * backfill rows that already carry their own zero-score signal).
 */
export function applyConformalGuardrail(
  hits: readonly SearchHit[],
  cfg: ConformalGuardrailConfig,
): ConformalGuardrailResult {
  if (cfg.minCalibratedConfidence <= 0) {
    return { kept: [...hits], droppedCount: 0 };
  }
  const floor = cfg.minCalibratedConfidence;
  let droppedCount = 0;
  const kept: SearchHit[] = [];
  for (const hit of hits) {
    const filteredFacts = hit.facts.filter((f) => {
      // Defensive: no breakdown → keep. The synthesize generator
      // anyway grounds its citation on factLines emitted from the
      // kept set, so a missing breakdown is observation-noise not
      // a guardrail failure.
      const calibrated = f.breakdown?.calibratedConfidence;
      if (calibrated === undefined) return true;
      if (calibrated >= floor) return true;
      droppedCount += 1;
      return false;
    });
    if (filteredFacts.length === 0) continue;
    kept.push({ ...hit, facts: filteredFacts });
  }
  return { kept, droppedCount };
}

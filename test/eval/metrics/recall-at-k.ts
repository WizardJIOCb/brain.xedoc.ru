import type { QueryResult } from '../types';

/**
 * Recall@K — share of queries where the expected entity appears in top K
 * of the returned results.
 *
 * Skips queries with `mustBeAbsent` semantics (those are scored by the
 * pii-gating metric instead).
 */
export function recallAtK(results: QueryResult[], k: number): number {
  const scoreable = results.filter((r) => !isAbsenceQuery(r));
  if (scoreable.length === 0) return 0;
  const hits = scoreable.filter((r) => r.rankOfExpected > 0 && r.rankOfExpected <= k).length;
  return hits / scoreable.length;
}

function isAbsenceQuery(r: QueryResult): boolean {
  return r.piiGatedCorrectly !== null;
}

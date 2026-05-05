import type { QueryResult } from '../types';

/**
 * Mean Reciprocal Rank. For each query: 1/rank if expected found,
 * 0 otherwise. Average over all scoreable queries (excludes
 * absence-style PII-gating queries).
 */
export function meanReciprocalRank(results: QueryResult[]): number {
  const scoreable = results.filter((r) => r.piiGatedCorrectly === null);
  if (scoreable.length === 0) return 0;
  const sum = scoreable.reduce((acc, r) => acc + (r.rankOfExpected > 0 ? 1 / r.rankOfExpected : 0), 0);
  return sum / scoreable.length;
}

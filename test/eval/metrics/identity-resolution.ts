import type { IdentityMergeResult } from '../types';

/**
 * Identity resolution rate — share of identity_of merges that succeeded.
 * Null when no merges were attempted.
 */
export function identityResolutionRate(
  results: IdentityMergeResult[],
): number | null {
  if (results.length === 0) return null;
  const ok = results.filter((r) => r.merged).length;
  return ok / results.length;
}

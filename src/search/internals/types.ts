/**
 * Internal row shapes used by the retrieval stages.
 * Keeps the public SearchHit (response surface) separate from FactRow
 * (DB projection), so each stage can be typed precisely.
 */

/**
 * Stage label identifying which retrieval leg surfaced a fact.
 * Carried end-to-end so DecisionLog can attribute each retrieved fact
 * to the provenance activity that found it (HippoRAG/PROV-style).
 */
export type RetrievalStage =
  | 'hype'
  | 'lexical'
  | 'graph_seed'
  | 'graph_neighbour'
  | 'edge_expansion'
  | 'ppr'
  | 'backfill';

export interface FactRow {
  id: unknown;
  entityId: unknown;
  predicate: string;
  object: string;
  confidence: number;
  validFrom: string;
  validUntil?: string;
  recordedAt: string;
  retractedAt?: string;
  status: string;
  source: any;
  // Hydrated via inline projection — entity record inlined.
  entity?: {
    id: unknown;
    type: string;
    canonicalName: string;
    externalRefs?: Record<string, string>;
    mergedInto?: unknown;
  };
  // One of these is set per row depending on which leg surfaced it;
  // hybrid mode merges both and lets the fusion stage combine. Field
  // names sidestep the SurrealQL `vec::*` and `lex::*` namespace
  // prefixes — using `vec` or `lex` as a SELECT alias confuses the
  // parser's `ORDER BY` resolver and silently returns rows in
  // record-id order instead of by score.
  simScore?: number;
  bm25Score?: number;
  /**
   * Set of stages that surfaced this row. Multi-stage hits are common
   * (e.g. hype + graph_seed) — the set lets DecisionLog show every
   * contributing path without losing the dominant origin.
   */
  stages?: RetrievalStage[];
}

export type FusedRow = FactRow & { fusedScore: number };

/**
 * Per-fact score breakdown — every multiplicative component is kept
 * separate so the DecisionLog can show why this fact beat the others.
 *
 *  Phase 1 fields: fusedScore, confidence, decay, predBoost, finalScore,
 *                  stages.
 *  Phase 3 additions: calibratedConfidence (isotonic-mapped raw),
 *                  extractionEntropy (semantic entropy across N
 *                  extraction passes — Farquhar 2024 / Nikitin 2024),
 *                  conformalPValue (Phase 3.C guardrail signal).
 *
 * All new fields are optional so callers that only read the Phase 1
 * shape continue to compile and run.
 */
export interface ScoreBreakdown {
  fusedScore: number;
  confidence: number;
  /** Phase 3: isotonic-mapped raw → calibrated. Omitted when disabled. */
  calibratedConfidence?: number;
  /** Phase 3: semantic-entropy across N extraction passes. Omitted on N=1. */
  extractionEntropy?: number;
  /** Phase 3.C: conformal p-value for the synthesize-side guardrail. */
  conformalPValue?: number;
  decay: number;
  predBoost: number;
  finalScore: number;
  stages: RetrievalStage[];
}

export type ScoredRow = {
  row: FusedRow;
  score: number;
  breakdown: ScoreBreakdown;
};

export interface EntityBucket {
  entityId: string;
  rankScore: number;
  bestScore: number;
  facts: ScoredRow[];
}

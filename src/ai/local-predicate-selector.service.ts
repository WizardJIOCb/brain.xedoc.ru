import { Injectable, Logger } from '@nestjs/common';
import { EmbedderService } from './embedder.service';
import { cosineSimilarity } from '../common/vector-math';
import type { PredicateSnapshot } from './predicate-registry.service';

/**
 * Local predicate selector — picks the most likely canonical predicate
 * for a clause via embedding similarity, without an LLM call.
 *
 * Architecture:
 *   • Per-predicate description embeddings already live in the
 *     registry (migration 0012, written at bootstrap).
 *   • Given a clause text, embed it once and compute cosine vs each
 *     active predicate's embedding. Top-N by score.
 *   • The extractor uses this to OVERRIDE the LLM-coined predicate
 *     when the local pick is high-confidence. Catches the dominant
 *     failure mode in the EDC canonicalize path: text-embedding-3-small
 *     scores between short coined names ("job_title") and verbose
 *     predicate cards ("status: TYPE subject... ADMIT current role...")
 *     rarely hit the 0.85 academic threshold even when semantically
 *     equivalent. Embedding the CLAUSE directly ("Maria is our new
 *     CTO at Acme") against the same predicate cards scores much
 *     higher because both texts share role-shaped vocabulary.
 *
 * This is the symmetric counterpart of the chat router's
 * extractPredicateHintsLocally (Sprint 2): same embedder, same
 * registry embeddings, different query shape (clause vs question).
 *
 * No hardcoded phrase tables. Threshold is the only knob —
 * EXTRACTOR_LOCAL_PREDICATE_THRESHOLD env var, default 0.45 (tuned
 * for text-embedding-3-small on the CORE predicate cards).
 */
export interface RankedPredicate {
  predicateId: string;
  similarity: number;
}

@Injectable()
export class LocalPredicateSelectorService {
  private readonly logger = new Logger(LocalPredicateSelectorService.name);

  constructor(private readonly embedder: EmbedderService) {}

  /**
   * Rank predicates by cosine(embedding(clauseText), predicate.embedding).
   * Returns top-N sorted descending. Empty array on embed failure or
   * empty snapshot — caller handles the empty case (keeps the
   * LLM-coined predicate untouched).
   */
  async rank(
    clauseText: string,
    snapshot: PredicateSnapshot | null,
    topN = 5,
  ): Promise<RankedPredicate[]> {
    if (!snapshot || snapshot.embeddings.size === 0) return [];
    const trimmed = clauseText.trim();
    if (trimmed.length === 0) return [];
    let queryVec: number[];
    try {
      queryVec = await this.embedder.embed(trimmed);
    } catch (e) {
      this.logger.warn(
        `rank: embedding failed for clause "${trimmed.slice(0, 60)}": ${(e as Error).message}`,
      );
      return [];
    }
    const scored: RankedPredicate[] = [];
    for (const [predicateId, predEmb] of snapshot.embeddings) {
      const sim = cosineSimilarity(queryVec, predEmb);
      scored.push({ predicateId, similarity: sim });
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topN);
  }
}

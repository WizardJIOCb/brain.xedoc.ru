import type { BrainClient } from '@inite/knowledge';
import type { Scenario, SynthesizeOutcome } from '../types';
import {
  computeFaithfulness,
  type FaithfulnessSourceFact,
  type OpenAiLike,
} from '../metrics/faithfulness';

/**
 * Runs each scenario's synthesizeQueries via brain's /v1/synthesize
 * endpoint and pipes (answer, citations) through the RAGAS-style
 * faithfulness verifier. Returns a SynthesizeOutcome per query, with
 * pass/fail computed against the per-query faithfulnessFloor.
 *
 * Single responsibility: turn declarative synthesize expectations
 * into measured outcomes. Aggregation is in Aggregator.
 */
export class FaithfulnessChecker {
  constructor(
    private readonly brain: BrainClient,
    private readonly openai: OpenAiLike,
    private readonly model?: string,
  ) {}

  async check(scenario: Scenario): Promise<SynthesizeOutcome[]> {
    const expectations = scenario.synthesizeQueries ?? [];
    if (expectations.length === 0) return [];
    const outcomes: SynthesizeOutcome[] = [];

    for (const e of expectations) {
      const floor = e.faithfulnessFloor ?? 0.85;
      try {
        const res = await this.brain.synthesize({
          query: e.query,
          limit: 5,
          synthesisGuardrails: 'lenient',
          asOf: e.asOf,
        });

        const answer = res.answer;
        if (!answer || !answer.trim()) {
          // Synthesizer rejected — guardrail engaged. Pass when the
          // scenario explicitly tolerates this (allowEmptyAnswer); fail
          // otherwise so silent regressions don't sneak past the gate.
          outcomes.push({
            scenarioId: scenario.id,
            query: e.query,
            answer: null,
            reason: res.reason,
            faithfulness: null,
            totalClaims: 0,
            passed: !!e.allowEmptyAnswer,
            faithfulnessFloor: floor,
          });
          continue;
        }

        const sourceFacts: FaithfulnessSourceFact[] = res.citations.map((c) => ({
          factId: c.factId,
          predicate: c.predicate,
          object: c.object,
        }));

        const score = await computeFaithfulness(this.openai, {
          answer,
          sourceFacts,
          model: this.model,
        });

        const passed =
          score.faithfulness !== null &&
          score.faithfulness >= floor &&
          !score.verifierFailure;

        outcomes.push({
          scenarioId: scenario.id,
          query: e.query,
          answer,
          faithfulness: score.faithfulness,
          totalClaims: score.totalClaims,
          ...(score.verifierFailure
            ? { verifierFailureKind: score.verifierFailure.kind }
            : {}),
          passed,
          faithfulnessFloor: floor,
        });
      } catch (err) {
        outcomes.push({
          scenarioId: scenario.id,
          query: e.query,
          answer: null,
          reason: 'exception',
          faithfulness: null,
          totalClaims: 0,
          verifierFailureKind: 'exception',
          passed: false,
          faithfulnessFloor: floor,
        });
      }
    }
    return outcomes;
  }
}

import type { Scenario, ScenarioOutcome } from '../types';
import { SetupApplier } from './setup-applier';
import { QueryExecutor } from './query-executor';

/**
 * Runs ONE scenario end-to-end: setup → queries → outcome.
 * Pure orchestration over the two single-purpose collaborators.
 */
export class ScenarioRunner {
  constructor(
    private readonly setupApplier: SetupApplier,
    private readonly queryExecutor: QueryExecutor,
  ) {}

  async run(scenario: Scenario): Promise<ScenarioOutcome> {
    const { extractions, identityMerge } = await this.setupApplier.apply(scenario);

    const queryResults = [];
    for (const q of scenario.queries) {
      queryResults.push(await this.queryExecutor.execute(q));
    }

    return {
      scenarioId: scenario.id,
      vertical: scenario.vertical,
      queryResults,
      extractionResults: extractions,
      identityMergeResult: identityMerge,
    };
  }
}

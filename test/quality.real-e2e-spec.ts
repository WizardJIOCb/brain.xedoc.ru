/**
 * Quality eval — real OpenAI, separate process, vertical scenarios.
 *
 * Composition root: spawns one brain process with two API keys
 * (full + read-only-no-pii) on the same companyId, wires the runner
 * from its single-purpose collaborators, runs all scenarios, prints
 * the markdown report, asserts overall thresholds.
 */
import { BrainClient } from '@inite/knowledge';
import { spawnService, SpawnedService } from './spawn';
import { allScenarios } from './eval/scenarios';
import {
  SetupApplier,
  QueryExecutor,
  ScenarioRunner,
  Aggregator,
  EvalRunner,
  Reporter,
} from './eval/runner';

describe('Quality eval (real OpenAI, multi-vertical scenarios)', () => {
  let svc: SpawnedService;

  beforeAll(async () => {
    svc = await spawnService({
      // Primary key: all scopes including PII.
      scopes: ['brain:read', 'brain:write', 'brain:admin', 'brain:read_pii'],
      // Extra key on the same tenant without brain:read_pii — used by
      // the PII-gating scenarios.
      extraKeyScopes: [['brain:read', 'brain:write']],
    });
  }, 90_000);

  afterAll(async () => {
    if (svc) await svc.stop();
  });

  it('meets quality thresholds across verticals', async () => {
    const sdkOpts = { baseUrl: svc.baseUrl, timeoutMs: 60_000 };
    const fullClient = new BrainClient({ ...sdkOpts, apiKey: svc.primary.plaintext });
    const limitedClient = new BrainClient({ ...sdkOpts, apiKey: svc.extras[0].plaintext });

    const runner = new EvalRunner(
      new ScenarioRunner(
        new SetupApplier(fullClient),
        new QueryExecutor(fullClient, limitedClient),
      ),
      new Aggregator(),
    );

    const report = await runner.run(allScenarios);
     
    console.log('\n' + new Reporter().render(report) + '\n');

    const failures = report.overall.filter(
      (m) =>
        m.threshold !== undefined &&
        m.value !== null &&
        m.value < m.threshold,
    );
    expect({
      failed: failures.map(
        (m) => `${m.name} ${m.value?.toFixed(2)} < ${m.threshold}`,
      ),
    }).toEqual({ failed: [] });
  }, 600_000);
});

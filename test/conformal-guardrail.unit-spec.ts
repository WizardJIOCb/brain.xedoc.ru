import { applyConformalGuardrail } from '../src/synthesize/conformal-guardrail';
import type { SearchHit } from '../src/search/search.types';
import type { ScoreBreakdown } from '../src/search/internals/types';

function makeBreakdown(calibrated: number): ScoreBreakdown {
  return {
    fusedScore: 0.5,
    confidence: 0.9,
    calibratedConfidence: calibrated,
    decay: 1,
    predBoost: 1,
    finalScore: 0.45,
    stages: ['hype'],
  };
}

function hit(entityId: string, facts: Array<{ factId: string; calibrated?: number }>): SearchHit {
  return {
    entityId,
    entityType: 'org',
    canonicalName: entityId,
    externalRefs: {},
    facts: facts.map((f) => ({
      factId: f.factId,
      predicate: 'p',
      object: 'o',
      confidence: 0.9,
      validFrom: '2026-01-01',
      status: 'active',
      score: 0.5,
      breakdown: f.calibrated !== undefined ? makeBreakdown(f.calibrated) : undefined,
    })),
    score: 0.5,
  };
}

describe('applyConformalGuardrail', () => {
  it('passes through when floor is 0', () => {
    const hits = [hit('e1', [{ factId: 'f1', calibrated: 0.01 }])];
    const r = applyConformalGuardrail(hits, { minCalibratedConfidence: 0 });
    expect(r.kept).toEqual(hits);
    expect(r.droppedCount).toBe(0);
  });

  it('drops facts strictly below the floor', () => {
    const hits = [
      hit('e1', [
        { factId: 'high', calibrated: 0.8 },
        { factId: 'low', calibrated: 0.05 },
      ]),
    ];
    const r = applyConformalGuardrail(hits, { minCalibratedConfidence: 0.4 });
    expect(r.kept.length).toBe(1);
    expect(r.kept[0].facts.map((f) => f.factId)).toEqual(['high']);
    expect(r.droppedCount).toBe(1);
  });

  it('removes entities whose facts all drop out', () => {
    const hits = [
      hit('e1', [{ factId: 'lo1', calibrated: 0.05 }]),
      hit('e2', [{ factId: 'hi1', calibrated: 0.9 }]),
    ];
    const r = applyConformalGuardrail(hits, { minCalibratedConfidence: 0.5 });
    expect(r.kept.length).toBe(1);
    expect(r.kept[0].entityId).toBe('e2');
    expect(r.droppedCount).toBe(1);
  });

  it('keeps facts without a breakdown (cannot judge what cannot be scored)', () => {
    const hits = [hit('e1', [{ factId: 'no_bk' }])];
    const r = applyConformalGuardrail(hits, { minCalibratedConfidence: 0.95 });
    expect(r.kept.length).toBe(1);
    expect(r.droppedCount).toBe(0);
  });

  it('floor === calibratedConfidence keeps the fact (inclusive boundary)', () => {
    const hits = [hit('e1', [{ factId: 'eq', calibrated: 0.5 }])];
    const r = applyConformalGuardrail(hits, { minCalibratedConfidence: 0.5 });
    expect(r.kept[0].facts.length).toBe(1);
  });
});

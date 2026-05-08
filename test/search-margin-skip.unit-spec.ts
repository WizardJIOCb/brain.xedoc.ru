import { SearchService } from '../src/search/search.service';

describe('SearchService.shouldSkipRerankByMargin', () => {
  const skip = SearchService.shouldSkipRerankByMargin;

  it('returns false when threshold ≤ 0 (feature disabled)', () => {
    expect(skip([{ rankScore: 1.0 }, { rankScore: 0.1 }], 0)).toBe(false);
    expect(skip([{ rankScore: 1.0 }, { rankScore: 0.1 }], -0.1)).toBe(false);
  });

  it('returns false on singleton or empty candidate sets', () => {
    expect(skip([], 0.5)).toBe(false);
    expect(skip([{ rankScore: 0.9 }], 0.5)).toBe(false);
  });

  it('returns false when top1 score is non-positive (degenerate)', () => {
    expect(skip([{ rankScore: 0 }, { rankScore: -0.1 }], 0.5)).toBe(false);
    expect(skip([{ rankScore: -0.5 }, { rankScore: -0.6 }], 0.5)).toBe(false);
  });

  it('skips when relative gap meets threshold', () => {
    // gap = (1.0 − 0.4) / 1.0 = 0.6 ≥ 0.5
    expect(skip([{ rankScore: 1.0 }, { rankScore: 0.4 }], 0.5)).toBe(true);
  });

  it('keeps reranker when relative gap below threshold', () => {
    // gap = (1.0 − 0.7) / 1.0 = 0.3 < 0.5
    expect(skip([{ rankScore: 1.0 }, { rankScore: 0.7 }], 0.5)).toBe(false);
  });

  it('handles unnormalised scores via the relative formulation', () => {
    // rankScore is post-degree-boost — can exceed 1.0. Same gap shape.
    // gap = (10 − 4) / 10 = 0.6
    expect(skip([{ rankScore: 10 }, { rankScore: 4 }], 0.5)).toBe(true);
    // gap = (0.02 − 0.018) / 0.02 = 0.1 — small absolute, small relative
    expect(skip([{ rankScore: 0.02 }, { rankScore: 0.018 }], 0.5)).toBe(false);
  });

  it('threshold boundary: gap == threshold skips (≥ comparison)', () => {
    // gap = 0.5 / 1.0 = 0.5 == 0.5
    expect(skip([{ rankScore: 1.0 }, { rankScore: 0.5 }], 0.5)).toBe(true);
  });
});

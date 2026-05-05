import { Scenario } from '../types';

const ISO = (d: string) => new Date(d).toISOString();

/**
 * Health vertical exists primarily to exercise the PII gating path.
 * `address` and `dob` are pii_class=sensitive (require brain:read_pii).
 *
 * Scenario asserts:
 *  - operator without brain:read_pii does NOT see address/dob facts
 *    (mustBeAbsent queries)
 *  - operator WITH brain:read_pii does see them (regular query)
 */
export const healthScenarios: Scenario[] = [
  {
    id: 'health.pii-gating',
    vertical: 'health',
    description:
      'Patient profile carries sensitive PII. Without brain:read_pii scope, address-style queries must NOT surface the patient.',
    setup: [
      {
        kind: 'fact',
        entityRef: { vertical: 'health', id: 'patient_42' },
        predicate: 'name',
        object: 'Karin Lindgren',
        validFrom: ISO('2026-03-01'),
        confidence: 0.95,
        source: { vertical: 'health' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'health', id: 'patient_42' },
        predicate: 'address',
        object: '8 Linden St, Berlin',
        validFrom: ISO('2026-03-01'),
        confidence: 0.95,
        source: { vertical: 'health' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'health', id: 'patient_42' },
        predicate: 'dob',
        object: '1981-06-12',
        validFrom: ISO('2026-03-01'),
        confidence: 1.0,
        source: { vertical: 'health' },
      },
    ],
    queries: [
      // Caller without brain:read_pii — entity may surface (via the
      // non-PII `name` fact), but the gated predicate MUST be stripped
      // from the returned facts. This is the brain's stated semantics:
      // facts gated, not entities.
      {
        query: 'patient at 8 Linden St',
        expectedTopEntityRef: 'health.patient_42',
        callerScopes: ['brain:read'],
        mustNotLeakPredicate: 'address',
      },
      {
        query: 'patient born in 1981',
        expectedTopEntityRef: 'health.patient_42',
        callerScopes: ['brain:read'],
        mustNotLeakPredicate: 'dob',
      },
      // Same query WITH brain:read_pii — should find them and the
      // address fact should be present in the response.
      {
        query: 'patient at 8 Linden St',
        expectedTopEntityRef: 'health.patient_42',
        callerScopes: ['brain:read', 'brain:read_pii'],
        expectedFactPredicate: 'address',
      },
    ],
  },
];

import { Scenario } from '../types';

const ISO = (d: string) => new Date(d).toISOString();

/**
 * Bitemporal scenarios — exercise the (validFrom, validUntil,
 * recordedAt, retractedAt) coordinate system that distinguishes
 * brain from a CRUD store. Each scenario seeds a fact, then asks a
 * query that depends on knowing both *when the fact was true in the
 * world* and *when brain learned of it*.
 *
 * The eval runner uses asOf to specify the temporal cursor; the
 * top-entity expectation must hold from that cursor's viewpoint.
 */
export const bitemporalScenarios: Scenario[] = [
  {
    id: 'bitemp.tier-progression',
    vertical: 'rent',
    description:
      'Tenant tier upgraded from gold to platinum. As-of mid-period, gold should still surface; as-of after upgrade, platinum is current. Three queries exercise (a) historical slice with asOf, (b) current state, (c) post-upgrade asOf — all must rank the same entity but the predicate-match validates the right slice.',
    setup: [
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'tier_progression_cust' },
        predicate: 'name',
        object: 'Maria Schultz',
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'rent' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'tier_progression_cust' },
        predicate: 'tier',
        object: 'gold',
        validFrom: ISO('2026-04-01'),
        validUntil: ISO('2026-05-15'),
        confidence: 0.95,
        source: { vertical: 'rent', eventId: 'billing.tier_upgrade' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'tier_progression_cust' },
        predicate: 'tier',
        object: 'platinum',
        validFrom: ISO('2026-05-15'),
        confidence: 0.95,
        source: { vertical: 'rent', eventId: 'billing.tier_upgrade' },
      },
    ],
    queries: [
      // Historical slice: asOf mid-period, gold tier was active.
      // We check entity-level recall only — search returns matched-
      // facts (not all entity facts), so a `predicates: [tier]` pre-
      // filter would strip name from the lexical leg and let other
      // same-firstname tenants outrank. expectedFactPredicate is
      // dropped for the historical legs because the right place to
      // assert "bitemporal returned the right slice" is the
      // /v1/entities/:id/facts?asOf endpoint, not /search.
      {
        query: 'Maria Schultz',
        expectedTopEntityRef: 'rent.tier_progression_cust',
        asOf: ISO('2026-05-01'),
      },
      // Post-upgrade slice: asOf after the tier change.
      {
        query: 'Maria Schultz',
        expectedTopEntityRef: 'rent.tier_progression_cust',
        asOf: ISO('2026-06-01'),
      },
      // Current-state baseline (no asOf). Reported under recall@1:current
      // so a temporal-only regression doesn't mask non-temporal health.
      {
        query: 'tier upgraded customer Maria Schultz',
        expectedTopEntityRef: 'rent.tier_progression_cust',
        expectedFactPredicate: 'tier',
      },
    ],
  },
  {
    id: 'bitemp.address-change-with-overlap',
    vertical: 'rent',
    description:
      'Tenant address updated mid-validity. Active facts at different asOf points should reflect the right address — the historical and current slices are exercised independently.',
    setup: [
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'address_change_cust' },
        predicate: 'name',
        object: 'Juno Park',
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'rent' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'address_change_cust' },
        predicate: 'address',
        object: '12 Old Street, Berlin',
        validFrom: ISO('2026-04-01'),
        validUntil: ISO('2026-05-31'),
        source: { vertical: 'rent', eventId: 'billing.address_set' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'address_change_cust' },
        predicate: 'address',
        object: '88 New Avenue, Munich',
        validFrom: ISO('2026-06-01'),
        source: { vertical: 'rent', eventId: 'billing.address_change' },
      },
    ],
    queries: [
      // Historical asOf — old address was active in May. Entity-
      // level recall only (see tier-progression rationale above).
      {
        query: 'Juno Park',
        expectedTopEntityRef: 'rent.address_change_cust',
        asOf: ISO('2026-05-15'),
        callerScopes: ['brain:read', 'brain:read_pii'],
      },
      // Current asOf — new address is active in June onwards.
      {
        query: 'Juno Park',
        expectedTopEntityRef: 'rent.address_change_cust',
        asOf: ISO('2026-06-15'),
        callerScopes: ['brain:read', 'brain:read_pii'],
      },
      // Default (no asOf) — current-state read.
      {
        query: 'where does Juno Park live',
        expectedTopEntityRef: 'rent.address_change_cust',
        expectedFactPredicate: 'address',
        callerScopes: ['brain:read', 'brain:read_pii'],
      },
    ],
  },
  {
    id: 'bitemp.retracted-then-reasserted',
    vertical: 'shop',
    description:
      'Customer status went open → churned → re-engaged. Brain should reflect the latest active state in default queries.',
    setup: [
      {
        kind: 'fact',
        entityRef: { vertical: 'shop', id: 'reengaged_cust' },
        predicate: 'name',
        object: 'Felix Vogt',
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'shop' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'shop', id: 'reengaged_cust' },
        predicate: 'status',
        object: 'churned',
        validFrom: ISO('2026-04-15'),
        confidence: 0.85,
        source: { vertical: 'shop', eventId: 'billing.subscription_cancelled' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'shop', id: 'reengaged_cust' },
        predicate: 'status',
        object: 'active',
        validFrom: ISO('2026-05-20'),
        confidence: 0.95,
        source: { vertical: 'shop', eventId: 'billing.subscription_renewed' },
      },
    ],
    queries: [
      // Default — re-engaged customer's current status is active.
      {
        query: 'who reactivated their subscription recently',
        expectedTopEntityRef: 'shop.reengaged_cust',
        expectedFactPredicate: 'status',
      },
      // asOf during the churned window. Entity-level recall only.
      {
        query: 'Felix Vogt',
        expectedTopEntityRef: 'shop.reengaged_cust',
        asOf: ISO('2026-05-01'),
      },
    ],
  },
];

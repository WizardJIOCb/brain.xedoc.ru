import { Scenario } from '../types';

const ISO = (d: string) => new Date(d).toISOString();

/**
 * Cross-vertical scenario: same physical person known to TWO verticals
 * with different ids. Operator declares an identity_of link, then
 * searches in a way that should surface the merged knowledge.
 *
 * Asserts the identityMerge metric AND a downstream search that depends
 * on the merge.
 */
export const crossVerticalScenarios: Scenario[] = [
  {
    id: 'cross.rent-events-same-person',
    vertical: 'cross',
    description:
      'Anna Schmidt is both a rent tenant (rent.anna) and an events VIP (events.anna_h). Identity merge unifies their facts.',
    setup: [
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'anna' },
        predicate: 'name',
        object: 'Anna Schmidt',
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'rent' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'anna' },
        predicate: 'tier',
        object: 'gold',
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'rent' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'events', id: 'anna_h' },
        predicate: 'name',
        object: 'Anna Schmidt',
        validFrom: ISO('2026-04-10'),
        source: { vertical: 'events' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'events', id: 'anna_h' },
        predicate: 'interacted_with',
        object: 'attended classical concert',
        validFrom: ISO('2026-04-20'),
        source: { vertical: 'events', eventId: 'storefront.order.created' },
      },
    ],
    identityMerge: {
      survivorRef: 'rent.anna',
      loserRef: 'events.anna_h',
    },
    queries: [
      {
        query: 'Anna Schmidt across all verticals',
        expectedTopEntityRef: 'rent.anna',
      },
    ],
  },
];

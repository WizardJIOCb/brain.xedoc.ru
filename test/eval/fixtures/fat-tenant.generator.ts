/**
 * Fat-tenant generator — programmatically build a mid-scale tenant
 * fixture (~500 entities, ~3-5k facts) so retrieval techniques that
 * depend on graph density (PPR, GraphRAG, GNN-style) can be measured
 * outside the small-scale (~30 entities) regime where hub effects
 * pathologically dominate.
 *
 * Design goals:
 * - Deterministic. Seeded RNG so the same generator emits the same
 *   tenant on every CI run — eval scores are comparable across
 *   commits.
 * - Cheap to run. No LLM extraction in the build path; entities and
 *   facts are written via `kind: 'fact'` setup steps. The eval
 *   harness only pays for embeddings on the query path.
 * - Targets specific failure modes: shared-firstname disambiguation,
 *   hub-vs-leaf entity confusion, multi-hop graph traversal,
 *   bitemporal asOf on dense fact histories.
 */
import type { Scenario, SetupStep } from '../types';

const ISO = (d: string) => new Date(d).toISOString();

/**
 * Seeded mulberry32 PRNG. Cheap, deterministic, sufficient for
 * fixture generation (we don't need cryptographic strength).
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Maria', 'Maria', 'Maria', // intentional repeats — shared-firstname adversarial
  'James', 'James',
  'Anna', 'Anna',
  'Liam', 'Sophia', 'Mateo', 'Aiko', 'Priya', 'Rohit', 'Yuki', 'Zara',
  'Noah', 'Ethan', 'Olivia', 'Mia', 'Ava', 'Sara', 'Lucas', 'Eva',
  'Carlos', 'Diego', 'Lina', 'Elena', 'Ravi', 'Hassan', 'Layla',
  'Klaus', 'Greta', 'Hans', 'Ingrid',
];

const LAST_NAMES = [
  'Schmidt', 'Müller', 'Berg', 'Park', 'Kim', 'Tanaka', 'Volkov',
  'Rossi', 'Khan', 'Singh', 'Petrova', 'Nakamura', 'Ng', 'Reyes',
  'Chen', 'Wong', 'Holm', 'Andersen', 'Kowalski', 'Novak', 'Cohen',
  'Garcia', 'Martin', 'Costa', 'Silva', 'Ferraro', 'Okafor', 'Mensah',
];

const PROJECT_NAMES = [
  'Phoenix', 'Atlas', 'Helix', 'Nimbus', 'Orion', 'Pulse', 'Quartz',
  'Vector', 'Zenith', 'Hydra', 'Ember', 'Frost', 'Compass', 'Beacon',
];

const APPLIANCE_TOPICS = [
  'broken washing machine', 'dishwasher leak', 'fridge not cooling',
  'oven won\'t heat', 'air conditioner rattling', 'water heater failure',
];
const NOISE_TOPICS = [
  'late-night noise from upstairs', 'loud music from neighbours',
  'construction noise during work hours', 'barking dog next door',
];
const PARKING_TOPICS = [
  'parking spot taken by visitors', 'electric vehicle charger broken',
  'parking gate not opening', 'visitor parking abuse',
];
const PAYMENT_TOPICS = [
  'rent payment declined', 'card expired and payment failed',
  'auto-pay not configured', 'invoice missing line items',
];

export interface FatTenantOpts {
  seed?: number;
  customers?: number;
  staff?: number;
  projects?: number;
}

export interface FatTenantFixture {
  scenarios: Scenario[];
  /** Stats for diagnostics — total entities, total facts, etc. */
  stats: {
    customers: number;
    staff: number;
    projects: number;
    totalEntities: number;
    totalFacts: number;
  };
}

/**
 * Build a fat-tenant fixture as a SINGLE scenario whose `setup` array
 * holds all entities + facts. The scenario's queries cover specific
 * retrieval failure modes: shared-firstname, hub-vs-leaf, multi-hop,
 * temporal-asof.
 *
 * One scenario means one tenant DB on the eval — no cross-tenant
 * pollution and no migration cost amortised over many small
 * tenants. The runner walks the setup linearly so 5k facts take a
 * few seconds to seed even with no LLM in the loop.
 */
export function buildFatTenant(opts: FatTenantOpts = {}): FatTenantFixture {
  const seed = opts.seed ?? 42;
  const customerCount = opts.customers ?? 500;
  const staffCount = opts.staff ?? 50;
  const projectCount = opts.projects ?? 30;
  const rand = mulberry32(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

  const setup: SetupStep[] = [];
  let factCount = 0;

  // Customers — name + tier + a small pool of complaints/interactions.
  for (let i = 0; i < customerCount; i++) {
    const id = `cust_${i}`;
    const fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    setup.push({
      kind: 'fact',
      entityRef: { vertical: 'fat', id },
      predicate: 'name',
      object: fullName,
      validFrom: ISO('2026-01-01'),
      confidence: 0.95,
      source: { vertical: 'fat' },
    });
    factCount++;

    // Tier — half on gold, a fifth on platinum, the rest standard.
    const tierRoll = rand();
    const tier = tierRoll < 0.2 ? 'platinum' : tierRoll < 0.7 ? 'gold' : 'standard';
    setup.push({
      kind: 'fact',
      entityRef: { vertical: 'fat', id },
      predicate: 'tier',
      object: tier,
      validFrom: ISO('2026-02-01'),
      source: { vertical: 'fat' },
    });
    factCount++;

    // 0-3 complaints per customer — most have none, a few have many.
    const complaints = Math.floor(rand() * 4);
    for (let c = 0; c < complaints; c++) {
      const topicPool =
        rand() < 0.4
          ? APPLIANCE_TOPICS
          : rand() < 0.7
            ? NOISE_TOPICS
            : PARKING_TOPICS;
      setup.push({
        kind: 'fact',
        entityRef: { vertical: 'fat', id },
        predicate: 'complained_about',
        object: pick(topicPool),
        validFrom: ISO('2026-03-01'),
        source: { vertical: 'fat', messageId: `complaint_${id}_${c}` },
      });
      factCount++;
    }

    // 0-2 payment events per customer.
    if (rand() < 0.3) {
      setup.push({
        kind: 'fact',
        entityRef: { vertical: 'fat', id },
        predicate: 'interacted_with',
        object: pick(PAYMENT_TOPICS),
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'fat', eventId: 'billing.payment' },
      });
      factCount++;
    }
  }

  // Staff — name + role + assigned-to-project.
  for (let i = 0; i < staffCount; i++) {
    const id = `staff_${i}`;
    const fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    setup.push({
      kind: 'fact',
      entityRef: { vertical: 'fat', id },
      predicate: 'name',
      object: fullName,
      validFrom: ISO('2026-01-01'),
      confidence: 0.98,
      source: { vertical: 'fat' },
    });
    factCount++;
  }

  // Projects — name + a few interactions referencing them.
  for (let i = 0; i < projectCount; i++) {
    const id = `proj_${i}`;
    const projName = `Project ${pick(PROJECT_NAMES)}`;
    setup.push({
      kind: 'fact',
      entityRef: { vertical: 'fat', id },
      predicate: 'name',
      object: projName,
      validFrom: ISO('2026-01-01'),
      confidence: 0.99,
      source: { vertical: 'fat' },
    });
    factCount++;
  }

  // Edges: each project has 2-5 staff associated via mentioned_with.
  for (let i = 0; i < projectCount; i++) {
    const projId = `proj_${i}`;
    const teamSize = 2 + Math.floor(rand() * 4);
    for (let t = 0; t < teamSize; t++) {
      const staffIdx = Math.floor(rand() * staffCount);
      setup.push({
        kind: 'link',
        from: { vertical: 'fat', id: `staff_${staffIdx}` },
        to: { vertical: 'fat', id: projId },
        linkKind: 'mentioned_with',
        source: { vertical: 'fat' },
      });
    }
  }

  // Edges: 30% of customers have a contact-staff relationship.
  for (let i = 0; i < customerCount; i++) {
    if (rand() < 0.3) {
      const staffIdx = Math.floor(rand() * staffCount);
      setup.push({
        kind: 'link',
        from: { vertical: 'fat', id: `cust_${i}` },
        to: { vertical: 'fat', id: `staff_${staffIdx}` },
        linkKind: 'mentioned_with',
        source: { vertical: 'fat' },
      });
    }
  }

  // Pin a handful of named anchor entities so the queries below
  // have stable expected references even though most of the tenant
  // is randomised. These override-by-id facts collide with the
  // generated ones via UNIQUE on entity_external_ref.key — the
  // ingest dedupes them onto the same entity.
  const anchorFacts: SetupStep[] = [
    {
      kind: 'fact',
      entityRef: { vertical: 'fat', id: 'anchor_appliance_klaus' },
      predicate: 'name',
      object: 'Klaus Weber',
      validFrom: ISO('2026-04-01'),
      source: { vertical: 'fat' },
    },
    {
      kind: 'fact',
      entityRef: { vertical: 'fat', id: 'anchor_appliance_klaus' },
      predicate: 'complained_about',
      object: 'broken washing machine in unit 4B',
      validFrom: ISO('2026-04-10'),
      source: { vertical: 'fat', messageId: 'anchor_klaus_1' },
    },
    {
      kind: 'fact',
      entityRef: { vertical: 'fat', id: 'anchor_tier_maria' },
      predicate: 'name',
      object: 'Maria Volkov',
      validFrom: ISO('2026-01-01'),
      source: { vertical: 'fat' },
    },
    {
      kind: 'fact',
      entityRef: { vertical: 'fat', id: 'anchor_tier_maria' },
      predicate: 'tier',
      object: 'platinum',
      validFrom: ISO('2026-04-15'),
      source: { vertical: 'fat', eventId: 'billing.tier_change' },
    },
    {
      kind: 'fact',
      entityRef: { vertical: 'fat', id: 'anchor_phoenix_lead' },
      predicate: 'name',
      object: 'Olivia Park',
      validFrom: ISO('2026-01-01'),
      source: { vertical: 'fat' },
    },
    {
      kind: 'fact',
      entityRef: { vertical: 'fat', id: 'anchor_phoenix_lead' },
      predicate: 'interacted_with',
      object: 'led Project Phoenix kickoff',
      validFrom: ISO('2026-04-15'),
      source: { vertical: 'fat', eventId: 'auth.meeting' },
    },
  ];
  setup.push(...anchorFacts);
  factCount += anchorFacts.length;

  const queries = [
    // Anchor lookups — should resolve cleanly despite the noise.
    {
      query: 'Klaus Weber appliance complaint',
      expectedTopEntityRef: 'fat.anchor_appliance_klaus',
      expectedFactPredicate: 'complained_about',
    },
    {
      query: 'Maria Volkov platinum tier',
      expectedTopEntityRef: 'fat.anchor_tier_maria',
      expectedFactPredicate: 'tier',
    },
    {
      query: 'who led Project Phoenix kickoff',
      expectedTopEntityRef: 'fat.anchor_phoenix_lead',
      expectedFactPredicate: 'interacted_with',
    },
    // Disambiguation — the random name pool guarantees many "Maria"s,
    // we expect the anchor's specific facts to disambiguate.
    {
      query: 'Maria with platinum tier',
      expectedTopEntityRef: 'fat.anchor_tier_maria',
    },
  ];

  return {
    scenarios: [
      {
        id: 'fat-tenant.mid-scale',
        vertical: 'cross',
        description:
          `Fat-tenant fixture: ~${customerCount} customers + ${staffCount} staff + ${projectCount} projects, ~${factCount} facts. Tests retrieval at the scale where graph-aware techniques (PPR, community lookup) start to pay off.`,
        setup,
        queries,
      },
    ],
    stats: {
      customers: customerCount,
      staff: staffCount,
      projects: projectCount,
      totalEntities: customerCount + staffCount + projectCount + 3,
      totalFacts: factCount,
    },
  };
}

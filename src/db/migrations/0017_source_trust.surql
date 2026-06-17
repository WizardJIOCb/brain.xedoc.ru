-- 0017_source_trust — learned per-source trust + TruthfulRAG-style
-- conflict explanation surface.
--
-- Phase 2 of the must-have memory upgrade. The current resolver folds
-- source trust into a single hard-coded 0.5 inside `fn::resolve_fact`;
-- this migration replaces the constant with a learned, source-keyed
-- agreement rate, and extends the resolver's return shape with the
-- TruthfulRAG (AAAI-26) pattern: surface the dominant scoring
-- dimension + the slot-level delta that decided each conflict.
--
-- The table itself is intentionally minimal — we don't track the full
-- historical agreement series here (that lives in `knowledge_fact` +
-- the CHANGEFEED). One row per source key, hot-reloaded by the
-- explainer when it formats the narrative.

DEFINE TABLE IF NOT EXISTS source_trust SCHEMAFULL;

-- Canonical source identifier. Convention: `vertical:recorder` (e.g.
-- `rent:tenant.bot.v3`). For unsourced facts (system_seed) the key is
-- the literal `system_seed`. The ingest service computes this key from
-- the IngestFactDto.source object — see `sourceTrustKey()` in
-- conflict-resolver.ts.
DEFINE FIELD IF NOT EXISTS sourceKey ON source_trust TYPE string;

-- Rolling agreement rate ∈ [0, 1] — fraction of this source's facts
-- whose `fn::resolve_fact` outcome was INSERTED or SUPERSEDED (i.e. won
-- against priors) vs total ingests from this source. Backfilled by a
-- nightly job consuming the CHANGEFEED; starts at 0.5 for new sources.
DEFINE FIELD IF NOT EXISTS agreementRate ON source_trust TYPE float
    DEFAULT 0.5
    ASSERT $value >= 0 AND $value <= 1;

-- How many ingests fed into the rate. Below the bootstrap threshold
-- the resolver falls back to the neutral 0.5; above it the learned
-- rate is trusted. Threshold lives in the resolver, not here, so it
-- can be tuned without a migration.
DEFINE FIELD IF NOT EXISTS sampleCount ON source_trust TYPE int DEFAULT 0;

DEFINE FIELD IF NOT EXISTS lastUpdated ON source_trust TYPE datetime
    DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS source_trust_key_idx
    ON source_trust FIELDS sourceKey UNIQUE;

-- Lookup helper. Returns the learned rate when sampleCount >= 8,
-- otherwise the neutral 0.5 default. The 8-sample bootstrap matches
-- FaithfulRAG (ACL 2025) — below that, the rate is dominated by
-- noise from short-tailed sources.
DEFINE FUNCTION OVERWRITE fn::source_trust_for($source_key: string) {
    LET $row = (SELECT agreementRate, sampleCount FROM source_trust
                WHERE sourceKey = $source_key LIMIT 1)[0];
    RETURN IF $row IS NONE OR $row.sampleCount < 8 THEN
        0.5
    ELSE
        $row.agreementRate
    END;
};

-- 0015_collapse_pattern — learned state-change collapse cache.
--
-- The chat router's LLM call currently re-derives state-change collapses
-- ("moved to" → "lives in", "switched to" → "now prefers", etc.) from the
-- model's weights every turn. The set is finite and the mappings are
-- mechanical once observed.
--
-- This table caches the LLM's emitted (verb-phrase → present-state)
-- mappings. First occurrence pays the LLM round-trip; subsequent
-- identical phrases hit the cache and the router synthesises the edit
-- locally. Combined with Sprint 4's confidence gate, recurring tells
-- can skip the LLM call entirely.
--
-- No seed data — the table is empty at bootstrap. The system learns
-- from operation. Operators can edit / promote / deprecate entries
-- per-tenant just like predicate_registry.

DEFINE TABLE IF NOT EXISTS collapse_pattern SCHEMAFULL;

DEFINE FIELD IF NOT EXISTS pattern     ON collapse_pattern TYPE string;
DEFINE FIELD IF NOT EXISTS replacement ON collapse_pattern TYPE string;
-- How many times this pattern has been observed in LLM output. Useful
-- for operators triaging the learned set — high-count patterns are
-- battle-tested; one-shot patterns may be typos or hallucinations.
DEFINE FIELD IF NOT EXISTS sourceCount ON collapse_pattern TYPE int      DEFAULT 1;
DEFINE FIELD IF NOT EXISTS createdBy   ON collapse_pattern TYPE string   DEFAULT 'llm_auto'
  ASSERT $value IN ['system', 'admin', 'llm_auto'];
DEFINE FIELD IF NOT EXISTS createdAt   ON collapse_pattern TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updatedAt   ON collapse_pattern TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS lastUsedAt  ON collapse_pattern TYPE datetime DEFAULT time::now();

-- pattern is the natural key — case-folded form of the source verb phrase.
DEFINE INDEX IF NOT EXISTS collapse_pattern_idx
  ON collapse_pattern FIELDS pattern UNIQUE;

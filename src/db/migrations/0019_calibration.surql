-- 0019_calibration — confidence calibration + per-fact extraction
-- entropy. Phase 3 of the must-have memory upgrade.
--
-- Two additions:
--
-- 1. `extractionEntropy` (float, optional) on `knowledge_fact`.
--    Semantic entropy of the N-pass extraction that produced this
--    fact (Farquhar et al., Nature 2024 + Kernel Language Entropy,
--    NeurIPS 2024). NONE when N=1 (no entropy to compute). Used by
--    the synthesize-side conformal guardrail in Phase 3.C, and
--    surfaced in SearchHit alongside confidence so callers can
--    distinguish "the model said this confidently" from "the model
--    said this consistently across re-rolls".
--
-- 2. `calibration_table` — versioned isotonic-regression map from
--    raw → calibrated confidence. One active row per
--    (extractorModel, promptHash) pair; nightly recalculation writes
--    a new row and the CalibrationService swaps to it via the
--    CHANGEFEED. Bootstrap row written at app start from the
--    in-process gold set; nightly job replaces it with a CHANGEFEED-
--    sourced fit (fact retracted within 30d → correctness=0).

DEFINE FIELD IF NOT EXISTS extractionEntropy ON knowledge_fact
    TYPE option<float>
    ASSERT $value IS NONE OR ($value >= 0 AND $value <= 10);

DEFINE TABLE IF NOT EXISTS calibration_table SCHEMAFULL;

-- Extractor model id (e.g. 'gpt-4o-mini', 'gpt-4o-mini@2026-06'). The
-- calibration is model-specific — re-fit on every model migration.
DEFINE FIELD IF NOT EXISTS extractorModel ON calibration_table TYPE string;

-- Hash of the extractor system prompt — calibration is also prompt-
-- specific (a stricter prompt shifts confidence distributions). Stored
-- as the literal hex digest so operators can correlate with the
-- prompt in source.
DEFINE FIELD IF NOT EXISTS promptHash ON calibration_table TYPE string;

-- The fitted map. `thresholds[i]` is the upper bound of bin i; values[i]
-- is the calibrated value emitted when raw <= thresholds[i]. Encoded
-- so the schema doesn't constrain the bin count (PAV may merge bins).
DEFINE FIELD IF NOT EXISTS thresholds ON calibration_table TYPE array<float>;
DEFINE FIELD IF NOT EXISTS values     ON calibration_table TYPE array<float>;

-- Diagnostic — number of training pairs that fitted this row.
DEFINE FIELD IF NOT EXISTS sampleCount ON calibration_table TYPE int DEFAULT 0;

-- Monotone version counter. CalibrationService picks the row with
-- max(version) for each (extractorModel, promptHash). Bumped by the
-- nightly job on every successful re-fit.
DEFINE FIELD IF NOT EXISTS version ON calibration_table TYPE int DEFAULT 1;

DEFINE FIELD IF NOT EXISTS recordedAt ON calibration_table TYPE datetime
    DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS calibration_key_idx
    ON calibration_table FIELDS extractorModel, promptHash, version;

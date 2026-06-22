-- 0033_supersede_no_retracted_at — two resolver correctness fixes:
--   (A) restore migration 0014's contract: a NATURAL supersede must NOT
--       set retractedAt; and
--   (B) score each opponent's source trust from its OWN learned rate
--       (fn::source_trust_for) instead of the hardcoded 0.5 — see the
--       $scored block below. (B) is a no-op for sources with < 8
--       samples, so only learned rates change behaviour.
--
-- ── (A) retractedAt ──────────────────────────────────────────────────
--
-- Regression history:
--   0014 supersede branch set ONLY {status='superseded', supersededBy,
--        validUntil} — and documented, in caps, that retractedAt MUST
--        NOT be set because it "erases the predecessor from every asOf
--        slice", which is wrong for a natural state change (the
--        predecessor IS the truth in its window).
--   0018 regressed it: added retractedAt=now, retractionReason,
--        retractedBy to the supersede branch.
--   0021 inherited 0018's regression and added priorValidUntil (for the
--        revive-after-retract feature).
--
-- Effect of the regression:
--   - asOf / getProfile filters keyed on `retractedAt IS NONE` wrongly
--     hid a future-dated-supersede predecessor that is still valid NOW.
--   - the timeline emitted a spurious `fact.retracted` event for every
--     natural supersede (FactsService.getTimeline keys that event on
--     retractedAt being set).
--
-- Fix: drop ONLY `retractedAt = time::now()` from the supersede branch.
-- We KEEP retractionReason='superseded' + retractedBy='system' +
-- priorValidUntil: those are labels/snapshots, not visibility fields,
-- and FactsService.reviveSupersededBy + calibration's isCorrect rely on
-- the retractionReason='superseded' sentinel to tell a resolver-supersede
-- apart from a dreams-resolution supersede. Leaving them intact means
-- revive and calibration need no change; only the erroneous retractedAt
-- visibility side effect is removed.
--
-- The function body below is identical to 0021_revive_after_retract
-- except for the removed `retractedAt = time::now(),` line in the
-- supersede FOR-loop.

DEFINE FUNCTION OVERWRITE fn::resolve_fact(
    $entity_id: record<knowledge_entity>,
    $predicate: string,
    $object: string,
    $object_meta: option<object>,
    $embedding: array<float>,
    $confidence: float,
    $valid_from: datetime,
    $valid_until: option<datetime>,
    $source: object,
    $source_trust: float,
    $semantics: string,
    $similarity_threshold: float,
    $w_confidence: float,
    $w_source_trust: float,
    $w_recency: float,
    $w_authority: float,
    $reject_threshold: float,
    $margin_for_supersede: float
) {
    LET $new_score =
        $w_confidence * $confidence
        + $w_source_trust * $source_trust
        + $w_recency * 1.0
        + $w_authority * 0.0;

    IF $semantics = 'bitemporal' AND $new_score < $reject_threshold {
        CREATE ingest_dead_letter CONTENT {
            payload: { entityId: $entity_id, predicate: $predicate, object: $object, source: $source },
            reason: 'low_score: ' + <string>$new_score
        };
        RETURN { outcome: 'REJECTED', factId: NONE, reason: 'low_score' };
    };

    LET $candidates = SELECT
        id, predicate, object, confidence, recordedAt, source, embedding,
        validFrom, validUntil
    FROM knowledge_fact
    WHERE entityId = $entity_id
      AND predicate = $predicate
      AND status = 'active'
      AND retractedAt IS NONE;

    LET $competing = IF $semantics = 'append_only' THEN
        []
    ELSE IF $semantics = 'single_active' THEN
        $candidates
    ELSE
        (SELECT * FROM $candidates
            WHERE embedding != NONE
              AND vector::similarity::cosine(embedding, $embedding) >= $similarity_threshold
              AND fn::intervals_overlap(validFrom, validUntil, $valid_from, $valid_until))
    END;

    LET $new = CREATE ONLY knowledge_fact CONTENT {
        entityId: $entity_id,
        predicate: $predicate,
        object: $object,
        objectMeta: $object_meta,
        confidence: $confidence,
        validFrom: $valid_from,
        validUntil: $valid_until,
        source: $source,
        embedding: $embedding,
        status: 'active'
    };

    IF array::len($competing) = 0 {
        RETURN { outcome: 'INSERTED', factId: $new.id, reason: NONE };
    };

    -- Opponent source trust: feed each competitor's OWN learned rate via
    -- fn::source_trust_for(`vertical:recorder`) instead of the hardcoded
    -- 0.5. 0021 scored every incumbent at a constant 0.5, so a low-trust
    -- source could out-score a human_declared incumbent on the highest-
    -- weighted axis (audit finding). fn::source_trust_for returns 0.5
    -- when the source has < 8 samples, so this is a no-op for any fact
    -- whose source isn't in the learned source_trust table — only
    -- sources with a real rolling rate move.
    LET $scored = SELECT
        id,
        confidence,
        source,
        validFrom,
        object,
        predicate,
        $w_confidence * confidence AS sc_confidence,
        $w_source_trust * fn::source_trust_for(string::concat(<string>source.vertical, ':', <string>(source.recorder ?? ''))) AS sc_source_trust,
        $w_recency * math::pow(math::E, - duration::secs(time::now() - recordedAt) / 31536000) AS sc_recency,
        $w_authority * 0.0 AS sc_authority,
        ($w_confidence * confidence
         + $w_source_trust * fn::source_trust_for(string::concat(<string>source.vertical, ':', <string>(source.recorder ?? '')))
         + $w_recency * math::pow(math::E, - duration::secs(time::now() - recordedAt) / 31536000)
         + $w_authority * 0.0
        ) AS score
    FROM $competing;

    LET $best_opp_score = math::max($scored.score);
    LET $best_opp = (SELECT * FROM $scored WHERE score = $best_opp_score LIMIT 1)[0];

    LET $winner_components = {
        confidence: $w_confidence * $confidence,
        sourceTrust: $w_source_trust * $source_trust,
        recency: $w_recency * 1.0,
        authority: $w_authority * 0.0
    };
    LET $loser_components = {
        confidence: $best_opp.sc_confidence,
        sourceTrust: $best_opp.sc_source_trust,
        recency: $best_opp.sc_recency,
        authority: $best_opp.sc_authority
    };

    LET $abs_conf = math::abs($winner_components.confidence - $loser_components.confidence);
    LET $abs_st   = math::abs($winner_components.sourceTrust - $loser_components.sourceTrust);
    LET $abs_rec  = math::abs($winner_components.recency - $loser_components.recency);
    LET $abs_auth = math::abs($winner_components.authority - $loser_components.authority);
    LET $max_abs  = math::max([$abs_conf, $abs_st, $abs_rec, $abs_auth]);

    LET $dominant_dim = IF $max_abs = $abs_conf THEN 'confidence'
                       ELSE IF $max_abs = $abs_st THEN 'source_trust'
                       ELSE IF $max_abs = $abs_rec THEN 'recency'
                       ELSE 'authority'
                       END;

    LET $slot_delta = {
        predicate: ($best_opp.predicate != $predicate),
        object: ($best_opp.object != $object),
        validFrom: ($best_opp.validFrom != $valid_from),
        source: ($best_opp.source != $source)
    };

    LET $score_breakdown = {
        winner: {
            total: $new_score,
            confidence: $winner_components.confidence,
            sourceTrust: $winner_components.sourceTrust,
            recency: $winner_components.recency,
            authority: $winner_components.authority
        },
        loser: {
            total: $best_opp_score,
            confidence: $loser_components.confidence,
            sourceTrust: $loser_components.sourceTrust,
            recency: $loser_components.recency,
            authority: $loser_components.authority
        },
        margin: $new_score - $best_opp_score
    };

    LET $supersede =
        $semantics = 'single_active'
        OR $new_score >= $best_opp_score + $margin_for_supersede;

    LET $loser_ids = $competing.id;

    IF $supersede {
        -- Per-row UPDATE so each loser's priorValidUntil snapshot
        -- reflects its OWN prior interval, not a bulk value. A bulk
        -- SET would overwrite every loser's priorValidUntil with the
        -- same arbitrary row's reading.
        --
        -- NOTE (0033): NO `retractedAt = time::now()` here — a natural
        -- supersede is not a retraction. See migration 0014.
        FOR $loser IN $competing {
            UPDATE $loser.id SET
                status = 'superseded',
                retractionReason = 'superseded',
                retractedBy = 'system',
                supersededBy = $new.id,
                priorValidUntil = $loser.validUntil,
                validUntil = $valid_from;
        };
        RETURN {
            outcome: 'SUPERSEDED',
            factId: $new.id,
            supersededFactIds: $loser_ids,
            scoreBreakdown: $score_breakdown,
            dominantDimension: $dominant_dim,
            slotDelta: $slot_delta,
            bestOpponentId: $best_opp.id,
            reason: NONE
        };
    };

    UPDATE $new.id SET status = 'competing';
    UPDATE knowledge_fact SET status = 'competing' WHERE id IN $loser_ids;
    RETURN {
        outcome: 'COMPETING',
        factId: $new.id,
        competingFactIds: $loser_ids,
        scoreBreakdown: $score_breakdown,
        dominantDimension: $dominant_dim,
        slotDelta: $slot_delta,
        bestOpponentId: $best_opp.id,
        reason: NONE
    };
};

-- ── Data fix ─────────────────────────────────────────────────────────
-- Clear the erroneously-set retractedAt on rows already marked
-- superseded by the resolver (the retractionReason='superseded' +
-- retractedBy='system' sentinel). This restores asOf/timeline
-- visibility for historically-superseded facts. We DELIBERATELY keep
-- retractionReason/retractedBy — only retractedAt was the visibility
-- bug. Genuinely retracted facts (retractionReason != 'superseded')
-- are untouched.
UPDATE knowledge_fact
    SET retractedAt = NONE
    WHERE status = 'superseded'
      AND retractionReason = 'superseded'
      AND retractedBy = 'system'
      AND retractedAt IS NOT NONE;

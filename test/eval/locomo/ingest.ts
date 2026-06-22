/**
 * Translates a normalized LoCoMo conversation into brain ingest events.
 *
 * Each turn becomes one `POST /v1/ingest/mention` call — the body
 * carries the raw utterance + speaker + session timestamp, and
 * brain's NLU extractor turns it into entities and facts. We do NOT
 * pre-extract facts ourselves; the whole point is to evaluate brain's
 * extraction + retrieval pipeline, not our parser of LoCoMo.
 *
 * Speaker handling: each conversation has two speakers (Alice / Bob,
 * etc). We register both as first-class entities up front via
 * /v1/ingest/fact so subsequent mentions can attach to them
 * deterministically. Without that, the extractor sometimes invents
 * separate entities for "Alice" vs "Alice (Speaker A)" depending on
 * how the turn is phrased.
 *
 * Timing: every turn carries its session's date as `validFrom`. That
 * makes asOf queries from the QA layer work — "what did Alice say
 * about her cat in session 5?" runs with asOf = session_5_date.
 *
 * Idempotency: ingest IDs include the dia_id (e.g. "D1:5") so a
 * partial run can be resumed by skipping turns whose IDs already
 * exist. This is left as a hook on the IngestSink interface — the
 * default HTTP sink doesn't dedupe.
 */
import type { NormalizedConversation, LocomoTurn } from './types';

export interface IngestSink {
  /**
   * Register an entity. The vertical is constant ('locomo') for the
   * eval; the id is a sanitized speaker name.
   */
  registerSpeaker(input: {
    companyId: string;
    entityId: string;
    name: string;
    validFrom: string;
  }): Promise<void>;

  /**
   * Stream one conversation turn into brain's NLU extractor via
   * `POST /v1/ingest/mention`.
   */
  ingestMention(input: {
    companyId: string;
    speakerEntityId: string;
    text: string;
    validFrom: string;
    sourceMessageId: string;
  }): Promise<void>;
}

export interface IngestPlan {
  speakers: Array<{ entityId: string; name: string; validFrom: string }>;
  mentions: Array<{
    speakerEntityId: string;
    text: string;
    validFrom: string;
    sourceMessageId: string;
  }>;
}

/**
 * Build the ingest plan without sending anything. The runner can dry-
 * run for sanity (turn count, date range) before paying for the
 * extractor LLM calls.
 */
export function planIngest(conv: NormalizedConversation): IngestPlan {
  const earliestSession = conv.sessions[0];
  const baseDate = earliestSession?.dateTime ?? new Date(0).toISOString();
  const speakerAId = sanitizeId(conv.speakerA);
  const speakerBId = sanitizeId(conv.speakerB);
  const speakers = [
    { entityId: speakerAId, name: conv.speakerA, validFrom: baseDate },
    { entityId: speakerBId, name: conv.speakerB, validFrom: baseDate },
  ];
  const mentions: IngestPlan['mentions'] = [];
  for (const session of conv.sessions) {
    for (const turn of session.turns) {
      mentions.push({
        speakerEntityId: speakerEntityFor(turn, speakerAId, speakerBId, conv),
        text: turn.text,
        validFrom: session.dateTime,
        sourceMessageId: `locomo:${conv.sampleId}:${turn.dia_id}`,
      });
    }
  }
  return { speakers, mentions };
}

export async function executeIngest(
  plan: IngestPlan,
  sink: IngestSink,
  companyId: string,
): Promise<void> {
  for (const speaker of plan.speakers) {
    await sink.registerSpeaker({ companyId, ...speaker });
  }
  for (const mention of plan.mentions) {
    await sink.ingestMention({ companyId, ...mention });
  }
}

function sanitizeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function speakerEntityFor(
  turn: LocomoTurn,
  speakerAId: string,
  speakerBId: string,
  conv: NormalizedConversation,
): string {
  // LoCoMo turns carry the speaker name verbatim. Pick the matching
  // sanitized id. Fall back to speaker A if neither matches (rare —
  // multiparty conversations exist in some samples).
  if (turn.speaker === conv.speakerA) return speakerAId;
  if (turn.speaker === conv.speakerB) return speakerBId;
  return sanitizeId(turn.speaker) || speakerAId;
}

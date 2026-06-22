/**
 * HTTP-based QaAgent + IngestSink.
 *
 * Drives brain directly through the v1 HTTP surface — no Claude, no
 * MCP transport. Useful for two things:
 *   - CI baseline (deterministic, comparable run-to-run without an
 *     Anthropic key in the pipeline)
 *   - Component isolation when debugging which leg of the QA pipeline
 *     went wrong (retrieval miss vs synthesize hallucination)
 *
 * For the agent-natural number reported against Mem0 / Zep / MemGPT,
 * use ClaudeMcpAgent (see ./claude-agent.ts). Numbers from this agent
 * are a LOWER BOUND on what brain can do — no agent-level chain-of-
 * thought, just one shot through search + synthesize.
 */
import type { BrainHttpClient } from '../http-brain-client';
import type { IngestSink } from './ingest';
import type { QaAgent } from './runner';

export interface HttpAgentOptions {
  /** How many candidates the search leg returns before synthesize. */
  searchLimit?: number;
  /** synthesize mode — strict closes to null on partial; lenient returns the answer. */
  synthesisGuardrails?: 'strict' | 'lenient' | 'off';
  /** Cap on planner hops. The default 3 matches the paper's multi-hop split. */
  maxHops?: number;
  /** When true, drives /v1/search/multi-hop; else single-shot /v1/search → /v1/synthesize. */
  useMultiHop?: boolean;
}

export function createHttpQaAgent(
  client: BrainHttpClient,
  options: HttpAgentOptions = {},
): QaAgent {
  const searchLimit = options.searchLimit ?? 12;
  const guardrails = options.synthesisGuardrails ?? 'lenient';
  const maxHops = options.maxHops ?? 3;
  const useMultiHop = options.useMultiHop ?? true;

  return {
    async answer({ companyId: _companyId, question, asOf }) {
      void _companyId; // tenanting handled by the client's API key
      if (useMultiHop) {
        const res = (await (client as unknown as {
          call<T>(method: string, path: string, body?: unknown): Promise<T>;
        }).call('POST', '/v1/search/multi-hop', {
          query: question,
          maxHops,
          synthesize: true,
          synthesisGuardrails: guardrails,
          asOf,
        })) as { synthesis?: { answer?: string | null; reason?: string } };
        return res?.synthesis?.answer ?? '';
      }
      const synth = await client.synthesize({
        query: question,
        limit: searchLimit,
        synthesisGuardrails: guardrails,
        asOf,
      });
      return (synth as { answer?: string | null }).answer ?? '';
    },
  };
}

/**
 * HTTP-backed IngestSink. Registers each speaker as a `name` fact +
 * streams every conversation turn through /v1/ingest/mention.
 */
export function createHttpIngestSink(client: BrainHttpClient): IngestSink {
  return {
    async registerSpeaker({ entityId, name, validFrom }) {
      await client.ingest.fact({
        entityRef: { vertical: 'locomo', id: entityId },
        predicate: 'name',
        object: name,
        validFrom,
        source: { vertical: 'locomo', messageId: `locomo:speaker:${entityId}` },
        confidence: 1,
      });
    },
    async ingestMention({ speakerEntityId, text, validFrom, sourceMessageId }) {
      await client.ingest.mention({
        entityRef: { vertical: 'locomo', id: speakerEntityId },
        text,
        validFrom,
        source: { vertical: 'locomo', messageId: sourceMessageId },
      });
    },
  };
}

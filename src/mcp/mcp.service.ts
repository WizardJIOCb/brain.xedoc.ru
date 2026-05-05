import { Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SearchService } from '../search/search.service';
import { EntitiesService } from '../entities/entities.service';
import { IngestService } from '../ingest/ingest.service';
import { FactsService } from '../facts/facts.service';
import { BrainScope } from '../auth/api-key.types';

/**
 * Builds an MCP server instance bound to a single tenant + scope set.
 *
 * One McpServer per request — Streamable HTTP is request-scoped in stateless
 * mode, which suits multi-tenant per-request handling. We don't reuse server
 * instances across companies; that would require careful per-call swizzling
 * of the companyId, and the cost of constructing one is small relative to
 * the database round-trips inside each tool call.
 */
@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private readonly search: SearchService,
    private readonly entities: EntitiesService,
    private readonly ingest: IngestService,
    private readonly facts: FactsService,
  ) {}

  buildServer(companyId: string, scopes: BrainScope[]): McpServer {
    const server = new McpServer({
      name: 'inite-brain-service',
      version: '0.1.0',
    });

    // ── search_knowledge ──────────────────────────────────────────────
    server.registerTool(
      'search_knowledge',
      {
        title: 'Search company knowledge',
        description:
          'Semantic search over the company knowledge graph. Returns entities with their top facts and external references back to the originating verticals. Apply asOf for historical "what did we know on X" queries.',
        inputSchema: {
          query: z.string().describe('Natural-language query'),
          limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
          predicates: z.array(z.string()).optional().describe('Filter to these predicates only'),
          asOf: z.string().datetime().optional().describe('Knowledge as-of this ISO 8601 moment'),
          minConfidence: z.number().min(0).max(1).optional(),
        },
      },
      async (args) => {
        const out = await this.search.search(
          companyId,
          {
            query: args.query,
            limit: args.limit,
            predicates: args.predicates,
            asOf: args.asOf,
            minConfidence: args.minConfidence,
          },
          scopes,
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          structuredContent: out as any,
        };
      },
    );

    // ── get_entity_profile ────────────────────────────────────────────
    server.registerTool(
      'get_entity_profile',
      {
        title: 'Get entity profile',
        description:
          'Full profile of one entity: canonical name, type, externalRefs (cross-vertical ids), and active facts. Use externalRefs to rehydrate fresh state from the originating vertical via @inite/api-kit.',
        inputSchema: {
          entityId: z.string().describe('Brain entity id (knowledge_entity:...) or short id'),
          asOf: z.string().datetime().optional(),
        },
      },
      async (args) => {
        const out = await this.entities.getProfile(companyId, args.entityId, args.asOf, scopes);
        return {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          structuredContent: out as any,
        };
      },
    );

    // ── get_entity_timeline ───────────────────────────────────────────
    server.registerTool(
      'get_entity_timeline',
      {
        title: 'Get entity timeline',
        description:
          'Chronological audit of all facts brain has learned about this entity, including retracted ones. Useful for "what did we know when" investigations.',
        inputSchema: {
          entityId: z.string(),
          since: z.string().datetime().optional(),
          until: z.string().datetime().optional(),
        },
      },
      async (args) => {
        const out = await this.entities.getTimeline(
          companyId,
          args.entityId,
          args.since,
          args.until,
          scopes,
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          structuredContent: out as any,
        };
      },
    );

    // ── find_related_entities ─────────────────────────────────────────
    server.registerTool(
      'find_related_entities',
      {
        title: 'Find related entities',
        description: 'Get entities connected to the given one via the knowledge graph.',
        inputSchema: {
          entityId: z.string(),
          kind: z.string().optional().describe('Edge kind filter (e.g. "paid_for", "mentioned_in")'),
        },
      },
      async (args) => {
        const out = await this.entities.getConnections(companyId, args.entityId, args.kind);
        return {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          structuredContent: out as any,
        };
      },
    );

    // Write tools — only register if the caller has brain:write
    if (scopes.includes('brain:write')) {
      // ── record_fact ────────────────────────────────────────────────
      server.registerTool(
        'record_fact',
        {
          title: 'Record a fact about an entity',
          description:
            'Insert a fact about an entity. Triggers brain conflict resolution (INSERTED / SUPERSEDED / COMPETING / REJECTED). Use sparingly from agents — most facts should come from event ingestion.',
          inputSchema: {
            entityRef: z.union([
              z.object({ vertical: z.string(), id: z.string() }),
              z.object({ entityId: z.string() }),
            ]),
            predicate: z.string(),
            object: z.string(),
            validFrom: z.string().datetime(),
            validUntil: z.string().datetime().optional(),
            confidence: z.number().min(0).max(1).optional(),
            sourceVertical: z.string().describe('Vertical name attributed as source (e.g. "rent")'),
          },
        },
        async (args) => {
          const out = await this.ingest.ingestFact(companyId, {
            entityRef: args.entityRef as any,
            predicate: args.predicate,
            object: args.object,
            validFrom: args.validFrom,
            validUntil: args.validUntil,
            confidence: args.confidence,
            source: { vertical: args.sourceVertical, recorder: 'mcp_agent' },
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
            structuredContent: out as any,
          };
        },
      );

      // ── retract_fact ───────────────────────────────────────────────
      server.registerTool(
        'retract_fact',
        {
          title: 'Retract a fact',
          description:
            'Mark a fact as no longer believed. Cascades to facts derived from this one. Does not delete; the row remains for audit.',
          inputSchema: {
            factId: z.string(),
            reason: z.string(),
          },
        },
        async (args) => {
          const out = await this.facts.retract(companyId, args.factId, {
            reason: args.reason,
            retractedBy: { source: 'system' },
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
            structuredContent: out as any,
          };
        },
      );
    }

    return server;
  }
}

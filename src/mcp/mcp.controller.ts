import {
  All,
  BadRequestException,
  Controller,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ApiKeyGuard, RequireScopes } from '../auth/api-key.guard';
import { McpService } from './mcp.service';
import { AuthenticatedRequest } from '../auth/api-key.types';

@Controller('mcp')
@UseGuards(ApiKeyGuard)
export class McpController {
  constructor(private readonly mcp: McpService) {}

  /**
   * Per-tenant MCP Streamable HTTP endpoint.
   *
   * Security invariant from spec: companyId in URL path MUST match the
   * companyId on the ApiKey. Mismatch is 400.
   *
   * Stateless mode: each POST creates a fresh server + transport pair,
   * processes the JSON-RPC message, and tears down. No session state.
   * MCP clients that need long-running sessions should call once per
   * tool use; stateful sessions can be added later via sessionIdGenerator.
   */
  // MCP tools (search_knowledge, ingest_fact, …) reach the same
  // OpenAI-fanout paths that the REST controllers cap via the
  // `expensive` bucket. Without this the MCP route was a throttle
  // bypass at the 120/min default. Use a per-route expensive override
  // (30/min) rather than the global 10: a single stateless tool use is
  // several JSON-RPC POSTs (initialize / tools/list / tools/call), and
  // the handshake messages don't fan out to OpenAI — 30 leaves headroom
  // for them while still capping the OpenAI-bound calls well below 120.
  @Throttle({ expensive: { limit: 30, ttl: 60_000 } })
  @All(':companyId')
  @RequireScopes('brain:read')
  async handle(
    @Req() req: AuthenticatedRequest & Request,
    @Res() res: Response,
    @Param('companyId') pathCompanyId: string,
  ) {
    const auth = req.brainAuth;
    if (pathCompanyId !== auth.companyId) {
      throw new BadRequestException(
        `MCP path companyId (${pathCompanyId}) does not match ApiKey companyId`,
      );
    }

    const server = this.mcp.buildServer(auth.companyId, auth.scopes);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, (req as any).body);
  }
}

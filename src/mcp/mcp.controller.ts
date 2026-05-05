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

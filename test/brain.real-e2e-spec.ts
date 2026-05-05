/**
 * Real end-to-end test:
 *   - spawns inite-brain-service as a separate node process (dist/main.js)
 *   - hits it from outside via @inite/knowledge SDK over HTTP
 *   - hits the per-tenant MCP endpoint via @modelcontextprotocol/sdk client
 *   - uses real OpenAI for embeddings + LLM extraction
 *
 * SurrealDB still runs in a testcontainer (memory engine) so the test is
 * still hermetic at the DB layer.
 */
import { BrainClient } from '@inite/knowledge';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { spawnService, SpawnedService } from './spawn';

describe('Real e2e (separate process + real OpenAI + SDK + MCP)', () => {
  let svc: SpawnedService;
  let brain: BrainClient;

  beforeAll(async () => {
    svc = await spawnService();
    brain = new BrainClient({ baseUrl: svc.baseUrl, apiKey: svc.primary.plaintext });
  }, 60_000);

  afterAll(async () => {
    if (svc) await svc.stop();
  });

  it('SDK: ingest + search round-trip', async () => {
    const ingest = await brain.ingest.fact({
      entityRef: { vertical: 'rent', id: 'sdk_cust_1' },
      predicate: 'complained_about',
      object: 'broken heating system in the entire third floor',
      validFrom: new Date().toISOString(),
      source: { vertical: 'rent', messageId: 'sdk_msg_1' },
      confidence: 0.85,
    });
    expect(ingest.outcome).toBe('INSERTED');
    expect(ingest.factId).toMatch(/^knowledge_fact:/);

    const search = await brain.search({
      query: 'heating problems on upper floors',
      limit: 5,
    });
    expect(search.results.length).toBeGreaterThan(0);
    const found = search.results.some((r) =>
      r.facts.some((f) => f.predicate === 'complained_about'),
    );
    expect(found).toBe(true);
  }, 60_000);

  it('SDK: ingest mention runs real LLM extraction', async () => {
    const out = await brain.ingest.mention({
      text: 'Anna Schmidt called this morning. She wants to upgrade her tier and is unhappy about the late maintenance from last week.',
      contextRef: { vertical: 'rent', conversationId: 'conv_real_1', messageId: 'msg_real_1' },
      knownEntities: [{ vertical: 'rent', id: 'cust_anna', role: 'speaker' }],
      emittedAt: new Date().toISOString(),
    });
    expect(out.skipped).toBe(false);
    expect(out.extractedEntityIds.length).toBeGreaterThan(0);
    expect(out.extractedFactIds.length).toBeGreaterThan(0);
  }, 60_000);

  it('SDK: entity profile rehydration via externalRefs', async () => {
    await brain.ingest.fact({
      entityRef: { vertical: 'rent', id: 'sdk_cust_profile' },
      predicate: 'name',
      object: 'Bjorn Madsen',
      validFrom: new Date().toISOString(),
      source: { vertical: 'rent', messageId: 'sdk_msg_p1' },
      confidence: 0.95,
    });
    const search = await brain.search({ query: 'Bjorn Madsen', limit: 1 });
    const entityId = search.results[0]?.entityId;
    expect(entityId).toBeDefined();

    const profile = await brain.entityProfile(entityId);
    expect(profile.canonicalName).toBeDefined();
    // externalRefs uses sanitized __ keys server-side; the SDK exposes them
    // unchanged for the caller.
    expect(Object.keys(profile.externalRefs).length).toBeGreaterThan(0);
  }, 60_000);

  it('MCP: list_tools and call search_knowledge', async () => {
    const url = new URL(`${svc.baseUrl}/mcp/${svc.companyId}`);
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: { Authorization: `Bearer ${svc.primary.plaintext}` },
      },
    });
    const client = new McpClient({ name: 'real-e2e-test', version: '0.0.1' });
    await client.connect(transport);

    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name);
      expect(names).toContain('search_knowledge');
      expect(names).toContain('get_entity_profile');
      expect(names).toContain('record_fact'); // brain:write present in test creds

      // Seed at least one fact so search has something to find.
      await brain.ingest.fact({
        entityRef: { vertical: 'rent', id: 'mcp_cust_1' },
        predicate: 'said',
        object: 'Roof tiles flew off in last night storm',
        validFrom: new Date().toISOString(),
        source: { vertical: 'rent', messageId: 'mcp_msg_1' },
      });

      const callRes = await client.callTool({
        name: 'search_knowledge',
        arguments: {
          query: 'storm damage roof',
          limit: 3,
        },
      });
      expect(callRes.isError).toBeFalsy();
      // Tool returns text + structuredContent. Either form should expose results.
      const sc = callRes.structuredContent as { results?: any[] } | undefined;
      expect(Array.isArray(sc?.results)).toBe(true);
    } finally {
      await client.close();
    }
  }, 60_000);

  it('SDK: retract closes validity and timeline records both events', async () => {
    const f = await brain.ingest.fact({
      entityRef: { vertical: 'rent', id: 'sdk_cust_retract' },
      predicate: 'tier',
      object: 'gold',
      validFrom: new Date().toISOString(),
      source: { vertical: 'rent', messageId: 'sdk_msg_r1' },
    });
    expect(f.factId).toBeTruthy();

    const r = await brain.facts.retract(f.factId!, {
      reason: 'mistaken upgrade',
      retractedBy: { source: 'human', userId: 'u_admin' },
    });
    expect(r.factId).toBe(f.factId);
    expect(r.cascadedFactIds).toEqual([]);

    // Timeline shows recorded + retracted
    const search = await brain.search({
      query: 'tier: gold',
      includeRetracted: true,
    });
    const entityId = search.results[0]?.entityId;
    expect(entityId).toBeDefined();
    const tl = await brain.timeline(entityId);
    const types = tl.events.map((e) => e.type);
    expect(types).toContain('fact.recorded');
    expect(types).toContain('fact.retracted');
  }, 60_000);

  it('SDK: forget cascade + tombstone with HMAC', async () => {
    await brain.ingest.fact({
      entityRef: { vertical: 'rent', id: 'sdk_cust_forget' },
      predicate: 'name',
      object: 'Tobias Ericsson',
      validFrom: new Date().toISOString(),
      source: { vertical: 'rent', messageId: 'sdk_msg_f1' },
    });
    await brain.ingest.fact({
      entityRef: { vertical: 'rent', id: 'sdk_cust_forget' },
      predicate: 'email',
      object: 'tobias@example.com',
      validFrom: new Date().toISOString(),
      source: { vertical: 'rent', messageId: 'sdk_msg_f2' },
    });
    const search = await brain.search({ query: 'Tobias Ericsson' });
    const entityId = search.results[0]?.entityId;
    expect(entityId).toBeDefined();

    const forget = await brain.entities.forget(entityId, {
      reason: 'gdpr_request',
      requestId: 'real_e2e_forget',
    });
    expect(forget.factsDeleted).toBeGreaterThanOrEqual(2);
    expect(forget.entityIdHash.startsWith('hmac:')).toBe(true);

    // After forget, profile read should 404
    let threw = false;
    try {
      await brain.entityProfile(entityId);
    } catch (err) {
      threw = true;
      expect((err as { status?: number }).status).toBe(404);
    }
    expect(threw).toBe(true);
  }, 90_000);
});

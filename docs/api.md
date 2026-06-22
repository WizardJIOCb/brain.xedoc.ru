# API reference

All v1 endpoints are live; MCP transport is mounted per tenant. Every
v1 call requires `Authorization: Bearer <plaintext>` where the key's
SHA-256 lives in `BRAIN_API_KEYS`. Admin endpoints require
`brain:admin` scope on top of base auth; PII surfaces require
`brain:read_pii`.

## Health + observability

| Endpoint | Notes |
|---|---|
| `GET /health` | Container + SurrealDB readiness. No auth. |
| `GET /metrics` | Prometheus exposition (in-cluster scrape). |

## Ingest

| Endpoint | Notes |
|---|---|
| `POST /v1/ingest/fact` | Declared structured fact ingest. |
| `POST /v1/ingest/mention` | NLU extraction → entities + facts. |
| `POST /v1/ingest/link` | Typed edge between entities (incl. `identity_of` for cross-vertical merge). |

## Read

| Endpoint | Notes |
|---|---|
| `POST /v1/search` | Hybrid (vector + BM25), router-boosted, listwise rerank w/ self-consistency, per-leg CI, entity-fact backfill. See [Architecture § Retrieval pipeline](architecture.md#retrieval-pipeline). |
| `POST /v1/synthesize` | Corrective-RAG with strict / lenient / off guardrails + claim-level faithfulness scorer. See [Architecture § Synthesize](architecture.md#synthesize-corrective-rag). |
| `POST /v1/search/multi-hop` | Planner-LLM decomposes the query into ≤N anchored sub-queries; carries supportingFactIds for HotpotQA-style joint-F1 eval. See [Architecture § Multi-hop](architecture.md#multi-hop-search). |
| `GET /v1/entities/:id` | Entity profile + active facts (PII-gated by scope). |
| `GET /v1/entities/:id/timeline` | Bitemporal sweep — all facts ever known, with validFrom / validUntil / recordedAt / retractedAt. |
| `GET /v1/entities/:id/connections` | Typed edges + direct neighbours. |
| `GET /v1/artifacts/:type/:entityId` | Derived artifacts (profile / digest / etc) with manual `recompile` POST. |

## Mutation (audited)

| Endpoint | Notes |
|---|---|
| `POST /v1/facts/:id/retract` | Mark a fact retracted with reason; survives in audit trail. |
| `POST /v1/entities/:id/forget` | Hard GDPR cascade — facts + edges + embeddings deleted, HMAC tombstone retained. |

## Background work

| Endpoint | Notes |
|---|---|
| `POST /v1/dreams/run` | Off-hours self-improvement: dedup / resolve / summarize (admin scope). |

## Admin — jobs + leases

| Endpoint | Notes |
|---|---|
| `GET /v1/admin/jobs` | List job_run rows (filter by jobType / status / since / companyId). |
| `GET /v1/admin/jobs/:runId` | Single job_run detail. |
| `POST /v1/admin/jobs/:runId/cancel` | Flip `cancelRequested=true` — worker loop aborts on next renew tick. |
| `GET /v1/admin/jobs/stream` | SSE stream of job_run transitions for live dashboard. |
| `GET /v1/admin/leases` | leader_lease snapshot + active claims across tenants (Phase J cockpit). |
| `GET /v1/admin/scheduler` | Registered cron entries with last/next fire timestamps. |
| `POST /v1/admin/maintenance/dreams/run` | Async kick of dreams (returns runId). |
| `POST /v1/admin/maintenance/calibration-refit` | Async kick of calibration + source-trust refit. |
| `POST /v1/admin/maintenance/reindex` | Async re-embed `knowledge_fact`, optionally per tenant. |
| `GET /v1/admin/changefeed/state` | Consumer lag + per-(tenant, source) cursor table. |
| `POST /v1/admin/changefeed/drain` | Manual drain of pending change events. |

Every admin endpoint listed in [`src/contracts/admin/`](../src/contracts/admin/)
has a zod wire contract. The browser-side BFF at
`brain-landing/app/api/admin/proxy/[...path]/route.ts` parses every
response through the same schema — drift becomes a loud 502 instead of
a quiet stale field.

## MCP

| Endpoint | Notes |
|---|---|
| `ALL /mcp/:companyId` | Streamable HTTP MCP endpoint per tenant. |

## Auth + scopes

| Scope | Grants |
|---|---|
| `brain:read` | All read endpoints; PII facts only as `__pii_redacted__` placeholder. |
| `brain:write` | All ingest endpoints. |
| `brain:read_pii` | Lifts the PII gate — `dob` / `email` / `phone` / `address` facts return real values. |
| `brain:admin` | All `/v1/admin/*` endpoints, dreams trigger, retraction / forget. |

Keys are stored as `sha256:<hex>` — see [Getting started](getting-started.md#seed-an-apikey)
for the seeding flow.

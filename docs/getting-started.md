# Getting started

Brain runs on Node 22 + SurrealDB 2.3.10 + OpenAI. The fast path is
five commands; everything else is in the linked docs.

## Prerequisites

- Node 22 (`pnpm` recommended)
- Docker (for the local SurrealDB)
- An OpenAI API key

## Run locally

```bash
# Start SurrealDB
docker compose up -d surrealdb

# Install + run
pnpm install
cp .env.example .env
# Fill OPENAI_API_KEY and (if exposing) BRAIN_API_KEYS

pnpm start:dev
```

Health check:

```bash
curl http://localhost:3000/health
```

## Seed an ApiKey

Brain stores only the SHA-256 of API keys. Pick a plaintext, compute
its hash, put the hash in `.env`:

```bash
node -e "console.log('sha256:'+require('crypto').createHash('sha256').update('local-dev-key').digest('hex'))"
# → sha256:abc...
```

```env
BRAIN_API_KEYS=[{"keyHash":"sha256:abc...","companyId":"co_demo","scopes":["brain:read","brain:write"]}]
```

## Smoke test

```bash
# Ingest one fact
curl -X POST http://localhost:3000/v1/ingest/fact \
  -H "Authorization: Bearer local-dev-key" \
  -H "Content-Type: application/json" \
  -d '{
    "entityRef": { "vertical": "rent", "id": "cust_42" },
    "predicate": "complained_about",
    "object": "late maintenance response",
    "validFrom": "2026-05-05T10:00:00Z",
    "source": { "vertical": "rent", "messageId": "msg_1" }
  }'

# Search
curl -X POST http://localhost:3000/v1/search \
  -H "Authorization: Bearer local-dev-key" \
  -H "Content-Type: application/json" \
  -d '{ "query": "maintenance issues", "limit": 5 }'
```

## Docker (compose)

```bash
docker compose --env-file .env up -d
curl http://localhost:${BRAIN_HOST_PORT:-3030}/health
```

Host port defaults to `3030` to avoid clashing with common dev ports —
override with `BRAIN_HOST_PORT`. The schema is reapplied per request
via `DEFINE … IF NOT EXISTS` — restarts and version upgrades are
idempotent.

## Next steps

- Wire your vertical: [Migration guide](migration-guide.md)
- Understand the read path: [Architecture](architecture.md)
- All knobs: [Operations](operations.md)
- Load your CRM and measure quality: [Eval harness](eval.md)

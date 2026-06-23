# brain.xedoc.ru deploy

Production files for `brain.xedoc.ru`.

```bash
cp deploy/brain.xedoc.ru/.env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

The production compose keeps SurrealDB private inside the Docker network and
publishes the Brain API only on `127.0.0.1:3031` for nginx.

`EMBEDDER_PROVIDER=bge-m3` makes embeddings run locally in the Brain container.
LLM-backed endpoints still require a real `OPENAI_API_KEY`.

The public Next.js web UI runs separately:

```bash
cp deploy/brain.xedoc.ru/.env.landing.example .env.landing
docker compose --env-file .env.landing -f docker-compose.landing.yml up -d --build
```

nginx routes `/v1`, `/mcp`, `/health`, `/ready`, and `/metrics` to the Brain
backend; all other paths go to the web UI.

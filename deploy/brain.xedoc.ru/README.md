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

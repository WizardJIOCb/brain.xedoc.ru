# INITE Brain Service

Cross-vertical knowledge layer for the INITE ecosystem.
**System of insight, not system of record.**

Brain maintains a per-tenant **bitemporal knowledge graph** (entities,
facts, edges) derived from ecosystem events. Verticals consume it
through the `@inite/knowledge` SDK; AI agents connect via per-tenant
MCP. Brain does not read from or write into any vertical's database —
state moves in over the event stream.

- **Production**: [brain.inite.ai](https://brain.inite.ai) ·
  auto-deploy on push to `main` · runbook in [`docs/DEPLOY.md`](docs/DEPLOY.md)
- **Spec**: [`inite.service.brain`](https://github.com/inite/inite-ecosystem/blob/main/core/services/brain.yaml)
  · [`knowledge` capability](https://github.com/inite/inite-ecosystem/blob/main/core/capabilities/knowledge.yaml)
- **License**: [AGPL-3.0-or-later](LICENSE)

## Latest gate run

```
recall@1                 0.965  [0.94–0.98]   n=255
MRR                      0.979  [0.97–0.99]   n=255
NDCG@10                  0.979
identity-resolution-f1   1.000
pii-gating-correctness   1.000
memory-lifecycle         1.000
faithfulness pass-rate   1.000  n=3
```

CI floors: recall@1 ≥ 0.6, recall@3 ≥ 0.8, MRR ≥ 0.5, identity-F1 ≥
0.8, pii-gating = 1.0, memory-lifecycle = 1.0, faithfulness pass-rate
≥ 0.8. Bootstrap-CI on every retrieval metric; per-predicate
breakdown + per-vertical split + temporal/current partition all in
the report. Numbers from the multi-vertical scenario suite plus 180
wikidata queries (90 Latin + 90 Cyrillic). Methodology:
[`docs/eval.md`](docs/eval.md).

## Architecture position

```
Layer 4 — Verticals
Layer 3 — @inite/* SDKs        ← @inite/knowledge consumes brain
Layer 2 — Horizontal services  ← inite.service.brain (this service)
Layer 1 — Identity (auth)
```

## Stack

NestJS 11 + TypeScript on Node 22 · SurrealDB 2.3.10 (HNSW + BM25,
per-tenant DBs) · BGE-M3 ONNX in a worker thread · OpenAI
`gpt-4o-mini` (extraction / synthesize / verifier) · optional Cohere
Rerank v3.5 · SurrealDB-native job queue (Phase J/K) · Traefik on the
inite-temporal droplet · OTel auto-instrumentation.

## Quick start

```bash
docker compose up -d surrealdb
pnpm install
cp .env.example .env  # fill OPENAI_API_KEY + BRAIN_API_KEYS
pnpm start:dev
```

Full walkthrough: [`docs/getting-started.md`](docs/getting-started.md).

## Documentation

| | |
|---|---|
| **Wire it up** | [Getting started](docs/getting-started.md) · [Migration guide](docs/migration-guide.md) |
| **Understand it** | [Architecture](docs/architecture.md) · [API reference](docs/api.md) · [Data model](docs/data-model.md) · [Bitemporal semantics](docs/bitemporal-semantics.md) |
| **Run it** | [Operations](docs/operations.md) · [Operator playbook](docs/operator-playbook.md) · [Deploy runbook](docs/DEPLOY.md) |
| **Measure it** | [Eval harness](docs/eval.md) |

All in [`docs/`](docs/README.md).

## Contributing

Every change must pass `pnpm test` + the eval gate (retrieval-quality
regression beyond per-metric tolerance blocks merge). Schema changes
ship as new numbered migrations in `src/db/migrations/`. PR
descriptions explain the *why*, not just the *what*.

Full guide: [`CONTRIBUTING.md`](CONTRIBUTING.md). Security
vulnerabilities: don't open a public issue, see
[`SECURITY.md`](SECURITY.md).

## License

GNU Affero General Public License v3.0 or later — see [`LICENSE`](LICENSE).

AGPL-3.0 was chosen because brain is a hosted backend service. If you
host brain (modified or not) for users accessing it over a network,
you must make the corresponding source available to them under the
same terms. If AGPL is incompatible with your downstream needs, open
an issue — we may consider relicensing specific modules if the
request is reasonable.

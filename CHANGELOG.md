# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/).

## [0.2.0](https://github.com/WizardJIOCb/brain.xedoc.ru/compare/v0.1.0...v0.2.0) (2026-06-23)


### Features

* 0.1.0 walking skeleton ([21d598a](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/21d598a81d1548d2089021ea9cec9fa82669a6dc))
* **admin-auth:** real OAuth code + PKCE for users, client_credentials for BFF ([c556493](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/c5564934daa231354c575ce37f84fe37610e08af))
* **admin-graph:** force-directed Obsidian-style physics + drag ([81635ae](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/81635ae6be6c5c4e7f2f7b5c1b1c4246950a74b1))
* **admin:** AdminModule + bitemporal asOf on /v1/entities/:id/connections ([84d8fd9](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/84d8fd9e74eb6fe5407dc6b32f7f513f379110b9))
* **admin:** Brain Lab — playground, scenarios runner, per-stage trace viewer ([4ff406a](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/4ff406ab282cafc1f828c4f076ee4c7c6f604933))
* **admin:** Phase J part 2.6 — /v1/admin/leases cockpit ([e6ec2cf](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/e6ec2cf46ae40e062727f2267a2f29939b16f982))
* **admin:** re-embed endpoint for provider swap (Phase 4.D.2) ([87d9331](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/87d93314d165d06031ed72885d77610919d74965))
* **audit:** periodic SHOW CHANGES consumer + audit_event sink ([9abf76e](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/9abf76ef5ac72b2db40445cb12a46083a2a1ef66))
* **auth:** BRAIN_STATIC_KEYS_ENABLED to opt static keys back in for prod BFF ([c625414](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/c62541430c609051ebe7433ba5d4480bc96d8d0e))
* **brain-lab:** assert PII gating, memoryAssertions, identityMerge in runner ([1f981f5](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/1f981f5f1225dd0e8e2b6554b11360f6da384ade))
* **brain-lab:** live demo deck for the 'memory that doesn't lie' talk ([e2406a8](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/e2406a8a90112e10db5a313be8a9b2284ce90eb9))
* **brain-landing:** admin graph explorer + overview dashboard ([e5e20d7](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/e5e20d717c1ec031a493a888e2f0daebf85c5011))
* **brain-landing:** Next.js marketing + MDX docs (EN/RU) ([f3e93a2](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/f3e93a21a0ca6a163a02b3bde25dca34ba994a60))
* **calibration:** boot prefers persisted calibration_table row over synthetic gold-set ([6deba33](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/6deba33651e5be05f034733de0f8675f060f5a53))
* **calibration:** isotonic confidence calibration (Phase 3.A) ([187dd4e](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/187dd4ee6be401b4050099f7190988048fea5b15))
* **calibration:** nightly source-trust + calibration refits (Phase 3.5) ([15903b0](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/15903b05b8835c4b31311497b80ae4b8335c1aa2))
* **demo:** big fact answers + per-stage trace strip on demo slides ([b770b5c](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/b770b5c7dd828bd49c6160a2d40ade071df8bcc8))
* **demo:** chat-shaped /demo/chat — LLM routes tell/ask + parses asOf ([7680b72](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/7680b726b16b322b9718903b8f5e160ebadf3cb6))
* **demo:** dreams identity-resolve button + asOf picker on live slide ([24ba75e](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/24ba75eb520cfed1e08dcd11d34427d8d514b393))
* **demo:** engine-view trace — full hierarchy + pretty-rendered artifacts ([111ef9c](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/111ef9c452a729922306d1f9439d63260cecf5d4))
* **demo:** explain WHY each fact is in the result set ([95432cd](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/95432cd4e265941d581c4a093ceab829c5298757))
* **demo:** graph-first search mode beside the current vector-first pipeline ([a88b2d8](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/a88b2d802d83fd92968463b7cf19d7967c44fd15))
* **demo:** lazy auto-dedup inline after every tell, deep resolve stays manual ([9730406](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/97304065094860871c4c40a419e407c11167de93))
* **demo:** live ingest+search slide — chat to brain on stage ([de0cea9](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/de0cea9eae0358d0a3b1174062580c6c26f0d279))
* **demo:** single path — graph-first, vector only as fallback ([fff2f1c](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/fff2f1cd9fc093baf3d60d188c9b2f7b1f5d267e))
* **demo:** surface fact anatomy — validity, piiClass, semantics, status, confidence ([2bd015b](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/2bd015b549d282528595f9cce7fe8ad108f8d6da))
* **demo:** surface setup/query errors on the run button banner ([5adddfb](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/5adddfb7adf0be42e1b0bee657f640897a2ad36e))
* **dreams:** off-hours self-improvement pass — dedup + resolve + LLM summaries ([29c248e](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/29c248ea3db141ac0d3f194bd870e2de7c40b951))
* **embedder:** BGE-M3 provider behind env switch (Phase 4.D.1) ([a8d3fa2](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/a8d3fa2e4961a86ecc38e13bbdbb1468ea06344a))
* **extractor:** N-pass self-consistency driver — wire SE/KLE to extractionEntropy column ([ce749dd](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/ce749ddec6f197a1ee5c3988d8c20c56e8f46370))
* full v1 endpoint coverage — retract, forget, entity reads, mention, link ([cd105e4](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/cd105e4393b67e0c73297cf5be328c822bb6bb9f))
* **ingest:** conflict explanation — TruthfulRAG slot delta (Phase 2) ([41c4e34](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/41c4e348033b0fe6141ad08fb37672abd7c56832))
* **ingest:** mention-path now tags locale + writes HyPE altEmbedding ([77b5142](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/77b5142cf656dbc19e1b067c0f2cd0ba17708c4c))
* **ingest:** populate source.recorder for mention-extracted facts ([15ac2d4](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/15ac2d433a352ae4a92f9337c575b8b087be1c1d))
* **jobs:** Phase J foundation — SurrealDB-native leader election via leader_lease ([b66eceb](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/b66ecebc678e5c1a2bca7bbda0310578e896d006))
* **jobs:** Phase J part 2.1 — JobClaimService CAS primitives ([01cc157](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/01cc1572c0059710251a31b0a784c783632d8fec))
* **jobs:** Phase J part 2.2 — WorkerLoopService leader poll loop ([38a81dc](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/38a81dcdf62589c54144f4c6ba0e4b9cf820dbdf))
* **jobs:** Phase J part 2.3 — LeaseManagerService housekeeping cron ([430a644](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/430a64440c24980ecf1fa4fab9fd862af92ac6b8))
* **jobs:** Phase J part 2.4 — cron methods enqueue via job_run ([b556035](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/b556035f75a086cad1e3f1711b8fcfb253750ee9))
* **jobs:** Phase J part 2.5 — cross-pod cancel via DB polling ([ebdc606](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/ebdc6066b95334c1b70dfaedc6516ae4540e0a7e))
* **jobs:** Phase K1 — JobWorkerPool + cpuBound dispatch route ([3e8f755](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/3e8f755ee2fd08a168a16ff22d4344acc3157b3d))
* **jobs:** Phase K2 — per-tenant fairness via weighted-shuffle ([ff82afb](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/ff82afbbb50557e87ede3a40bf3f74abe80fb75a))
* **jobs:** Phase K3 — OTel PRODUCER/CONSUMER spans on queue handoff ([cf7047e](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/cf7047e979d9a69580e1170d47de045a7983083b))
* **locale:** language detection + answer-language pinning (Phase 4.A+C) ([fb093da](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/fb093da76d737978bd30e157fa90b3589e2cdda8))
* **observability:** OpenTelemetry tracing with per-leg spans in search pipeline ([b3e31e6](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/b3e31e638aa6de0daffe36523c5eda4b92cf528a))
* per-tenant MCP Streamable HTTP transport ([3c31a38](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/3c31a381578cfc69d4876ea1c5f736ae30c187c9))
* **predicates:** v1.1 content-domain vocabulary (BRUP-01..06) ([#2](https://github.com/WizardJIOCb/brain.xedoc.ru/issues/2)) ([b239637](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/b239637eeaabfb167d1fe47ae3db86215209f7f7))
* **resolver:** wire fn::source_trust_for into fn::resolve_fact (close FaithfulRAG loop) ([3a12339](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/3a12339aa586a384a1bc7d520ab919fe6b37ffbe))
* **search,db:** SOTA bitemporal — Datomic-style "actual now" + Allen's overlap ([a5dce42](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/a5dce42bf2de435e576edb332217bc0324c001f1))
* **search:** cross-encoder reranker (Cohere Rerank v3.5) between fusion and LLM stage ([a8e4bd2](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/a8e4bd2f32909c885dd6c7237a2435d07245a0eb))
* **search:** lang-filtered first pass + cross-lingual backoff (Phase 4.B) ([7322081](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/7322081f4a0ebd2064b11bcf16b87feb72ea9f67))
* **search:** margin-based reranker skip + per-outcome metric ([b397d1c](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/b397d1c564ce04e425e91d2be4a926273e07a657))
* **search:** multi-hop chained search with planner-LLM and synth opt-in ([9ed62f6](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/9ed62f63a81d943756e4c68f8d52c39bbd1def69))
* **search:** permutation self-consistency reranker + tier-aware PPR + fat-tenant eval ([b739ccf](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/b739ccfb605da96fffb340b4c50d59b251bcc3ec))
* **search:** retrieval quality milestone — overall recall@1 0.78 → 0.88, MRR 0.86 → 0.93 ([558dc3e](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/558dc3e2e583f0271031f994022cf8d491b867fe))
* **search:** type-aware router + SubgraphRAG neighbourhood injection ([bdab7f4](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/bdab7f4984f044e88e95a91e9e0ba3d7d711c631))
* **skills:** brain skills bundle + build/bump/pack pipeline ([2806ffb](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/2806ffb0770df00865768043d201d7cf16d8e238))
* **synthesize+extractor:** conformal guardrail + semantic-entropy util (Phase 3.B+C) ([8ee8ebc](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/8ee8ebcb03bd43cfd78f42f4efd8045042549993))
* **synthesize:** activate ConU conformal guardrail with 0.30 default + enable OTel in prod ([91f0239](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/91f0239fcacf100d68328fcdbe80c555bdb5c9f0))
* **synthesize:** DecisionLog — per-fact reasoning trace (Phase 1) ([8894c2d](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/8894c2d2f9ab630cca2bc375b2fd8bdb1e4ea93b))
* **synthesize:** POST /v1/synthesize with corrective-RAG guardrail ([c6fee0f](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/c6fee0fed670d96302caf95475b6a1679d859855))


### Bug Fixes

* 503 graceful degrade in /v1/admin/demo/chat + slim Docker base ([359c8cc](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/359c8cc990e3961542e3f79cf1df629f54169de9))
* **admin-auth:** use NEXT_PUBLIC_APP_URL for redirect origin, not request.url ([e3e7091](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/e3e70912fe993704711e8e85825f685c97e6f53e))
* **admin-graph:** match brain /v1/search + /v1/entities response shape ([36a4721](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/36a47218c51144b7b0d9520171cc0e8f4863c28c))
* **admin:** import CompactionModule — AdminJobsController failed DI, app would not boot ([1e5ea7d](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/1e5ea7d2e5acd33e037e244766e3bd1d5115ee62))
* **ai:** embed token metrics, extraction cache key, guardrail hole, races ([3cc0cbc](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/3cc0cbc975d48f7ab2fe2b240461ccc1eb47d976))
* **artifacts:** preserve dirty flag raised mid-compile + real artifactType ([9e05ffe](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/9e05ffe1a25e99f091575c17f8235f239ec54015))
* **bitemporal:** keep prior value current during a future-dated supersede gap ([3cadf66](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/3cadf669f98b2485d51ba67d834f09899df002a1))
* **bitemporal:** supersede ≠ retract; auto-strip temporal anchors ([c3af3c9](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/c3af3c9b6022b15072e4dbcb90320d42af33485a))
* **brain-lab:** security + tenant safety + reliability audit fixes ([5fc94d0](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/5fc94d0303d52df25c8987603205e6ae9d2d9030))
* **brain-landing:** Dockerfile must COPY hooks/ + middleware.ts ([93ee1fe](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/93ee1fe1ef35a03888f176969532bf5d5c50dd13))
* **brain-landing:** enable remark-gfm so pipe tables render ([ae59e36](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/ae59e367c5d59710358a83cc7b96fd5f0bf4b96e))
* **brain-landing:** start next directly, skip pnpm deps-check on boot ([d8464e8](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/d8464e8f53dc65da719b3094a588e9c13f47160d))
* **brain-landing:** sync pnpm-lock.yaml with package.json ([6a2ea4b](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/6a2ea4b9a42e61110d9560c5c0895d499958406d))
* **brain-mcp:** explicit types:[node] so it builds under TypeScript 6 ([b247d1f](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/b247d1f52f1b06b620075e3ff74c04eace6ca3a3))
* **build:** pin rootDir=src so dist/main.js path is stable ([966e752](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/966e752a928618cedd18b79872087371fa93b0a3))
* **build:** regenerate lockfile for chrono-node + @xenova/transformers ([d3c76a9](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/d3c76a9c7ab13fdaf82e2c9956072c34900d971c))
* **calibration:** align bootstrap promptHash key — persisted nightly refits now reload on boot ([8783d75](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/8783d752079ff388b52675a72ef6dbedf2096b36))
* **calibration:** pass raw key to loadMap — nightly refit hot-reload was a double-hash no-op ([29382c6](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/29382c6d3e0fbba4d704c62053707323e65ee8c9))
* **calibration:** project recordedAt so the source-trust ORDER BY resolves ([4c4db79](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/4c4db79393d65496b9fd3b984c7479a703727053))
* **ci:** forceExit on e2e + raise build-test timeout — stop the post-suite hang ([5cfe933](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/5cfe933a84465376d073f01a84a9c7e06f6ae753))
* **ci:** gate unit suite + real-Surreal jobs e2e on every PR ([fed08c9](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/fed08c95d1c03d72782559046454bc483c7181d5))
* **config:** fail closed in production when scoped DB creds are missing ([a1f260a](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/a1f260aa57d18f129dcd4099d8f39a88cd35cce2))
* **demo:** chat router never crashes the chat turn ([7f12bcf](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/7f12bcff99ce4ca20a884dbeab6bff5b163cd752))
* **demo:** chat survives registry / migration failures ([64bf922](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/64bf922c28bc0da7cee3f209c7b5287c66043c86))
* **demo:** entity-aware chat router resolves short refs before ingest ([4ac4064](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/4ac4064fb785a181562abedf041376f957303773))
* **demo:** graph-first actually finds the subject ([eb74a1f](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/eb74a1f8fef8a2fb28dab7bd8be003ad8a09c2e4))
* **demo:** no-anchor ask defaults to current truth, not today-midnight ([135b29a](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/135b29a169d288a8c57343661c416d80bcf646c3))
* **demo:** pii slide gates address (sensitive), not email (identifier) ([d956613](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/d9566132915b691f7f8cbf61fff5e2e300bc9370))
* **demo:** router extracts validFrom from temporal hints in tell ([9f3f44d](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/9f3f44df9f3012ea37c89d9f953b7309be6b1e34))
* **demo:** router preserves all facts + graph hits are explained ([0b9a17c](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/0b9a17c0f388aae7ee2307e861306f9de11abbb0))
* **demo:** scenario ids without dots (NestJS path-param parsing) ([2047ad5](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/2047ad519743c13dc7b304493ff5db2842b3b707))
* **demo:** warn when tenant carries stale data from a prior session ([bdd3a34](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/bdd3a34ec4a661effa40db67db6a5b77394cf7ee))
* **docker:** install wget in slim base for compose healthcheck ([3c951b6](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/3c951b68d38612a67481e3cc1f60a6e61a51ba48))
* **docker:** native deps (sharp, onnxruntime-node) actually link in prod ([8d608ea](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/8d608eaefb1ab68e00bec66653908bf18fa1c013))
* **docker:** pin sharp@0.34 across the dep tree via pnpm override ([1d0051b](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/1d0051b39358beea5ab2395d44b6585fe45c7544))
* **dreams:** close the loser's interval on resolve, matching fn::resolve_fact ([ca2627f](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/ca2627f683890d1454c84096c7c69d7bf9377978))
* **eval:** real TS errors + spawn path + tsbuildinfo footgun ([cda6564](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/cda656420a912c05c445f2e9d03b07f3c0a6677e))
* **extractor:** span-ground entity names + word-boundary value grounding ([00e7b4b](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/00e7b4b646d950f089e86fd4603856cd2dc351e9))
* **extractor:** status object is the literal role, preference is the noun ([6e7005d](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/6e7005d58fb8e044d6153ced0ec8103be989c0b0))
* **hardening:** input validation, calibrated panel, interval + redaction ([0fc06ed](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/0fc06edce974b0e2b404cadf7ab32d4df2f57d31))
* **hardening:** prod fence for THROTTLE_DISABLED, sanitize requestId, honour OpenAI knobs ([0ddbe9e](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/0ddbe9e0227cb014627c83f306e963098e8e82cb))
* **ingest:** cycle-guard for identity_of merges ([67a78f7](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/67a78f7d83f39a07ace2dcb0b9fe517bc029cb97))
* **jobs:** re-check ownership on terminal job writes — close split-brain double-execution ([0c495d7](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/0c495d758f12022b8c071010c83e21f079cce9fa))
* **jobs:** worker-pool lifecycle, cancel-hint leak, real distributed lease ([87046ab](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/87046ab99b851dea43ec7be7ef9dc78f71409ce1))
* **landing:** COPY content/ into Docker build — docs & blog were 404 ([27310c6](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/27310c6e110c6f702de87abe18c6385ecaf4258f))
* **landing:** regenerate standalone pnpm-lock to unblock Docker deploy ([3034e04](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/3034e041370fc2a1aa887299489b59039bd2c04a))
* **migrations:** 0013 SurrealQL 'SELECT 1;' is invalid — empty NOOP ([9b7776d](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/9b7776de86063ff27cb2248dcbbfc65ad3f6960e))
* **openai:** upgrade SDK 4.83 → 5.16 (eliminate node-fetch Premature close) ([c18163a](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/c18163a39af9fbda16779b1776ec4acb2d7a2fad))
* **ops:** run container as non-root + resource ceilings + scoped creds in compose ([5aad6c5](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/5aad6c5a2aac9ca12a06d91d0bda3e9d163a5889))
* **privacy:** close PII leaks in connections/changefeed + dedup SINCE boundary ([6301807](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/6301807ef2368c518f939f0c2cfe549f680400e0))
* **privacy:** complete the GDPR forget cascade + redact PII from the changefeed mirror ([0a544dd](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/0a544dda0c16a9614ad6f01e2832c8efe9befe6f))
* **privacy:** forget() purges audit_event mirror + records erasure actor (GDPR Art.17/30) ([41acfb7](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/41acfb77b92396d8b9f4b739f3067b80de9625cd))
* **registry:** null → NONE for option&lt;...&gt; fields in SCHEMAFULL writes ([84864d4](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/84864d430c553bd0f399015707864980f535b0de))
* **resilience:** global exception filter + process crash handlers ([8426058](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/8426058be6e64a2dea23ca0314d8dda2347e4362))
* **resilience:** headers-sent guard, uncaughtException crash, OTel/worker shutdown ([ce2fa47](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/ce2fa477cd1c5543068767af907980bc9e7fdf12))
* **resolver:** migration 0034 restores learned source-trust dropped by 0033 + gate ([1f5563d](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/1f5563dd078935171928c27f3709d4bc41eb011b))
* **resolver:** natural supersede must not set retractedAt + score opponents by learned source trust ([1d77523](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/1d775238719aa176d14c17bf0be68479ef8e7a56))
* revive-after-retract semantics + chat-router graceful LLM failure ([6469397](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/64693972a453871f0e1f4ed562e63027489e7227))
* **search:** correct rerank margin pair, degree-boost tie, provenance, PPR ([12710b2](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/12710b2315819860a5eaaa07f1aee21b7609d781))
* **search:** lexical leg WHERE-clause precedence — retracted facts could leak via searchHaystack ([5afa49c](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/5afa49ca4c7f30e68b341abbb105782399469508))
* **surreal:** close+rebuild on auth failure (work around v2.0.3 ws bugs) ([a97f92e](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/a97f92e8e91349fb3912974aa42acc38ccef7615))
* surrealdb v2 + flexible-object schemas + e2e suite (15/15 green) ([5a7634c](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/5a7634c8c39ee44197dbbcd896350973b4afd6d6))
* **surreal:** re-sign root conns after long-idle ws disconnect ([441740e](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/441740eee678834387e4df13178666dd0c984b06))
* **surreal:** unconditional re-signin (RETURN \$auth probe was lying) ([2811c41](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/2811c417b83c306abbd78ab9b55da973596184b6))
* **throttle:** put search + MCP + demo OpenAI-fanout routes in the expensive bucket ([3388cf3](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/3388cf31199eb3fa0f82f1065e87b5d04cc89b58))


### Performance Improvements

* **admin:** Phase H — cron reentrancy guards + async maintenance + Surreal acquire timeout + parallel fan-out ([2985fe4](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/2985fe42f7272f3f76b04c6665b25fa2a4db6afc))
* **boot:** unblock BGE-M3 warmup + add /ready endpoint ([0cde424](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/0cde42488550d3913c2bfb973fd9c5882d6b060b))
* **embedder:** batched embedMany API with LRU pass-through ([c2bb9c9](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/c2bb9c9153e16d36ec22c274e520494a06e0802e))
* **embedder:** route predicate-bootstrap + reindex through embedMany ([881c61c](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/881c61ce120b5b7c49f815c692faed0879e3d5de))
* **graph:** resolveSeedEntities uses BM25 SEARCH index, not full-table substring scan ([13ee3c9](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/13ee3c9fa9272b74dd1d51e6cb79e16863020eb3))
* **infra:** Phase I — BGE-M3 worker_thread (opt-in), changefeed bulk insert, trace bytes cap ([eeffae7](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/eeffae75b663600e996422bc514f6b45e189ae1d))
* **ingest:** mention loop batches embeddings via embedMany before fn::resolve_fact ([ae18363](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/ae183634471b44267ae6000a6bb9b4d98f61cf31))
* LRU-bound per-tenant snapshot caches + ApiKey keyHash validation ([9dc8f10](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/9dc8f1076d1599b0719166d7211d82dd66c490ba))
* **request:** plumb AbortController from req.on(close) into OpenAI calls ([83a530f](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/83a530fe10df82ec585cbd8f3435f612681b183e))
* **router:** standalone bench + CI gates for local-only path ([ab7d000](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/ab7d000de48a044f08de0ce17dc24a0b23f7aae8))


### Reverts

* **demo:** roll back sprint 1 risky changes to isolate the 500 ([01a348f](https://github.com/WizardJIOCb/brain.xedoc.ru/commit/01a348ff64352c0a82124eeda066b309bbee25b1))

## [0.1.0] — 2026-06-23

First public open-source release.

### Added

- **Bitemporal knowledge graph** — every fact carries valid time and
  transaction time; query `now` or replay any past state via `asOf`.
- **Hybrid retrieval pipeline** — vector + BM25 fusion, HyPE, predicate
  router, graph edge-expansion, tier-aware PPR, cross-encoder, and a listwise
  LLM reranker with self-consistency. Each stage is a per-tenant feature flag.
- **Conflict-aware ingest** — scored resolution ladder with
  `INSERTED` / `COMPETING` / `SUPERSEDED` / `REJECTED` outcomes and a
  dead-letter table.
- **Memory lifecycle** — retract (auditable) and a synchronous GDPR forget
  cascade that leaves only an HMAC tombstone.
- **Identity resolution** — cross-vertical entity merge via `identity_of`.
- **Native MCP** — per-tenant Streamable HTTP endpoint with six scope-aware
  tools, plus four Anthropic-format agent skills.
- **Eval-gated CI** — multi-vertical retrieval + memory-lifecycle suite with
  bootstrap CIs; regressions past tolerance block merges.
- **Website** — marketing landing, bilingual (EN/RU) docs and blog, dynamic
  OG images, full SEO/AEO surface (robots, sitemap, llms.txt, ai.txt,
  agent-actions, JSON-LD) at [brain.inite.ai](https://brain.inite.ai).

### License

- AGPL-3.0-or-later.

[0.1.0]: https://github.com/inite-ai/inite-brain-service/releases/tag/v0.1.0

---
name: local-ai
description: "On-device AI in King Browser: WebLLM in a web worker, transformers.js models, the main-process model cache and its disk budget, lazy loading, VRAM and jank limits, offline behaviour. Use when changing aiWorker.ts, aiAgent.ts, SidePanel AI chat, model selection, model download or caching."
---

# Local AI

## Files
- Chat model: `@mlc-ai/web-llm` in `src/workers/aiWorker.ts` (`WebWorkerMLCEngineHandler`), orchestrated by `src/services/aiAgent.ts`, `agentOrchestrator.ts`; UI `src/components/SidePanel.tsx`. Config tested by `tests/webllm_config.test.ts`.
- transformers.js (`@huggingface/transformers`) for speech (see `speech-recognition`) and other pipelines.
- Model cache: renderer runs on `file://` where the Cache API is unavailable, so shards are stored by main via `model-cache-get` / `model-cache-set` under `userData/models`, file names `sha256(url)`, budget in `electron/main/modelCacheQuota.ts` (512 MB per file, 1 GB total, stale temp reclaim).
- Lazy loading: heavy chunks are code-split (`aiWorker` and `web-llm` chunks are about 6 MB each in `dist/assets`); `tests/ai_agent_lazy_load.test.ts`, `tests/ai_vram_anti_jank.test.ts`.
- Network: model downloads go to Hugging Face hosts listed in the CSP `connect-src` and README "Network connections".

## Rules
- Never load AI code on startup paths; keep it behind user action.
- New model hosts require CSP and README updates; cache only through the main-process cache with the quota.
- Do not claim a model runs offline until its shards are cached; first use needs the network.
- Measure memory before and after model init when changing models (see `performance-testing`).

## Verify
`npm test` (tests above plus `performance_optimization_audit`), `npm run build` and check chunk sizes in `dist/assets`.

## Done when
Startup does not load AI code, cache writes stay within budget, and hosts are documented.

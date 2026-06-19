import { Logger } from '@nestjs/common';
import { Semaphore } from '../../common/semaphore';
import type { EmbedderProvider } from './embedder-provider.interface';

interface FeatureExtractionPipeline {
  (
    input: string | string[],
    opts?: { pooling?: 'cls' | 'mean'; normalize?: boolean },
  ): Promise<{ data: Float32Array | number[] }>;
}

export interface BgeM3EmbedderConfig {
  modelId: string;
  /** BGE-M3 native dim is 1024; configurable for downstream truncation. */
  dimensions: number;
  concurrency: number;
}

/**
 * BGE-M3 embedding provider — multilingual dense embeddings via
 * `@xenova/transformers` (arXiv:2402.03216, 2024). Loads lazily in
 * `warmup()` so the boot path doesn't block on the model download;
 * `isReady()` flips to true once the pipeline resolves. Until then,
 * EmbedderService falls back to the alternate provider.
 *
 * Why BGE-M3 over OpenAI text-embedding-3-* for the multilingual path:
 *   - 100+ languages with strong cross-lingual recall (MIRACL SOTA).
 *   - Runs locally — no per-request OpenAI cost on hot retrieve paths
 *     once the model is warm.
 *   - Same vector-space as Phase 4.B lang-filtered retrieve, so the
 *     filtered + backoff legs share a consistent geometry.
 */
export class BgeM3EmbedderProvider implements EmbedderProvider {
  readonly providerId: string;
  private readonly logger = new Logger(BgeM3EmbedderProvider.name);
  private readonly modelId: string;
  private readonly dimensions: number;
  private readonly limiter: Semaphore;
  private pipeline: FeatureExtractionPipeline | null = null;

  constructor(cfg: BgeM3EmbedderConfig) {
    this.modelId = cfg.modelId;
    this.dimensions = cfg.dimensions;
    this.providerId = `bge-m3:${cfg.modelId}:${cfg.dimensions}`;
    this.limiter = new Semaphore(cfg.concurrency);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  isReady(): boolean {
    return this.pipeline !== null;
  }

  /** Test seam — drive the BGE path without loading the real model. */
  setPipelineForTesting(p: FeatureExtractionPipeline | null): void {
    this.pipeline = p;
  }

  async warmup(): Promise<void> {
    const start = Date.now();
    try {
      const transformers = await import('@xenova/transformers');
      this.pipeline = (await transformers.pipeline(
        'feature-extraction',
        this.modelId,
      )) as unknown as FeatureExtractionPipeline;
      this.logger.log(
        `BGE-M3 ready (${this.modelId}) — warmup ${Date.now() - start}ms`,
      );
    } catch (e) {
      this.logger.warn(
        `BGE-M3 warmup failed for ${this.modelId}: ${(e as Error).message}; service will fall back to OpenAI`,
      );
      this.pipeline = null;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.pipeline) {
      throw new Error('BGE-M3 pipeline not ready — caller must check isReady()');
    }
    const trimmed = text.trim();
    if (!trimmed) return new Array(this.dimensions).fill(0);
    return this.limiter.run(async () => {
      const out = await this.pipeline!(trimmed, {
        pooling: 'cls',
        normalize: true,
      });
      const v = Array.from(out.data as Iterable<number>);
      // Truncate / pad to the configured dim. BGE-M3 native is 1024;
      // mismatches are operator config errors but we don't crash on
      // a single bad row — extract bills already paid.
      if (v.length === this.dimensions) return v;
      if (v.length > this.dimensions) return v.slice(0, this.dimensions);
      const padded = new Array(this.dimensions).fill(0);
      for (let i = 0; i < v.length; i++) padded[i] = v[i];
      return padded;
    });
  }
}

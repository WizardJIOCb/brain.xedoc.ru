import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { Semaphore } from '../../common/semaphore';
import type { EmbedderProvider } from './embedder-provider.interface';

export interface OpenAIEmbedderConfig {
  apiKey: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
  maxRetries: number;
  concurrency: number;
}

/**
 * OpenAI embedding provider — the historical path. text-embedding-3-*
 * with caller-specified dimensions. Identical-text → identical vector
 * (deterministic).
 *
 * Kept thin: cache, concurrency limiter, and provider-vs-provider
 * routing all live in EmbedderService so swapping to BGE-M3 doesn't
 * disturb the call sites.
 */
export class OpenAIEmbedderProvider implements EmbedderProvider {
  readonly providerId: string;
  private readonly logger = new Logger(OpenAIEmbedderProvider.name);
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly dimensions: number;
  private readonly limiter: Semaphore;

  constructor(cfg: OpenAIEmbedderConfig) {
    this.openai = new OpenAI({
      apiKey: cfg.apiKey,
      timeout: cfg.timeoutMs,
      maxRetries: cfg.maxRetries,
    });
    this.model = cfg.model;
    this.dimensions = cfg.dimensions;
    this.providerId = `openai:${cfg.model}:${cfg.dimensions}`;
    this.limiter = new Semaphore(cfg.concurrency);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  isReady(): boolean {
    return true;
  }

  async embed(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) return new Array(this.dimensions).fill(0);
    return this.limiter.run(async () => {
      const res = await this.openai.embeddings.create({
        model: this.model,
        input: trimmed,
        dimensions: this.dimensions,
      });
      return res.data[0].embedding;
    });
  }
}

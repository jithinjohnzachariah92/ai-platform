import { embed, embedMany } from 'ai';
import { emit } from '@jz92/ai-core';
import type { EmbeddingResponse, EmbeddingBatchResponse } from '@jz92/ai-core';
import { assertSafeInput } from '@jz92/ai-core';
import { responseCache } from './cache.js';
import { resolveEmbeddingProvider } from './embeddingProvider.js';
import {
  buildEmbeddingModel,
  type EmbeddingInputType,
} from './embeddingClient.js';
import { AIProviderError, wrapError } from './errors.js';

// ── generateEmbedding ─────────────────────────────────────────────────────────
// Embeds a single text string. Returns the vector + model metadata.
// model + dimensions are non-negotiable in the response — they get written to
// pgvector alongside every stored vector so mismatches are caught early.
//
// inputType: 'document' when storing in pgvector, 'query' when searching.
// Defaults to 'document' — the more common case for building the store.

export const generateEmbedding = async (
  text: string,
  options: {
    inputType?: EmbeddingInputType;
    cacheKey?: string;
    traceId?: string;
    correlationId?: string;
    userId?: string;
  } = {},
): Promise<EmbeddingResponse> => {
  const {
    inputType = 'document',
    cacheKey,
    traceId = '',
    correlationId,
    userId,
  } = options;
  const config = resolveEmbeddingProvider();

  // Guard against prompt injection in text being embedded
  assertSafeInput(text, 'embedding input');

  // App-cache check — cache key includes provider + model to prevent
  // returning a Voyage vector when the caller expects an OpenAI vector
  const fullCacheKey = cacheKey
    ? `embed:${config.provider}:${config.model}:${cacheKey}`
    : `embed:${config.provider}:${config.model}:${text}`;

  const cached = responseCache.get<number[]>(fullCacheKey);
  if (cached) {
    emit({
      source: 'ai-provider',
      type: 'embedding.cache.hit',
      traceId,
      correlationId,
      userId,
      provider: config.provider,
      model: config.model,
      env: config.env,
      timestamp: new Date().toISOString(),
      cache: {
        layer: 'app-cache',
        key: fullCacheKey,
        hit: true,
        hitRate: responseCache.getStats().hitRate,
      },
    });
    return {
      embedding: cached,
      model: config.model,
      dimensions: cached.length,
      provider: config.provider,
      fromCache: true,
    };
  }

  const start = Date.now();

  try {
    const model = buildEmbeddingModel(config, inputType);
    const result = await embed({
      model,
      value: text,
      providerOptions: {
        voyage: { inputType },
      },
    });

    const embedding = result.embedding;

    // Dimension validation — catch model mismatches before they corrupt the store
    if (embedding.length !== config.dimensions) {
      throw new AIProviderError(
        `[ai-provider] Embedding dimension mismatch: expected ${config.dimensions}, got ${embedding.length}.\n` +
          `Model ${config.model} returned unexpected dimensions.\n` +
          `If you changed AI_EMBED_MODEL, re-embed your entire pgvector store.`,
        'UNKNOWN',
      );
    }

    // Store in app cache
    responseCache.set(fullCacheKey, embedding);

    emit({
      source: 'ai-provider',
      type: 'embedding.success',
      traceId,
      correlationId,
      userId,
      provider: config.provider,
      model: config.model,
      env: config.env,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      dimensions: embedding.length,
      inputTokens: result.usage?.tokens ?? 0,
    });

    return {
      embedding,
      model: config.model,
      dimensions: embedding.length,
      provider: config.provider,
      fromCache: false,
    };
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    const wrapped = wrapError(err, config.provider);
    emit({
      source: 'ai-provider',
      type: 'embedding.failure',
      traceId,
      correlationId,
      userId,
      provider: config.provider,
      model: config.model,
      env: config.env,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      error: { code: wrapped.code, message: wrapped.message },
    });
    throw wrapped;
  }
};

// ── generateEmbeddingBatch ────────────────────────────────────────────────────
// Embeds multiple texts in one API call — far more efficient than looping
// generateEmbedding() for bulk operations (building the pgvector store,
// re-embedding after a model change). No app-level cache for batches —
// cache individual embeddings instead if needed.

export const generateEmbeddingBatch = async (
  texts: string[],
  options: {
    inputType?: EmbeddingInputType;
    traceId?: string;
    correlationId?: string;
    userId?: string;
  } = {},
): Promise<EmbeddingBatchResponse> => {
  const {
    inputType = 'document',
    traceId = '',
    correlationId,
    userId,
  } = options;
  const config = resolveEmbeddingProvider();

  // Guard each text against injection
  texts.forEach((text, i) => assertSafeInput(text, `embedding input[${i}]`));

  const start = Date.now();

  try {
    const model = buildEmbeddingModel(config, inputType);
    const result = await embedMany({
      model,
      values: texts,
      providerOptions: {
        voyage: { inputType },
      },
    });
    const embeddings = result.embeddings;

    // Validate dimensions on the first result — all should match
    if (embeddings.length > 0 && embeddings[0].length !== config.dimensions) {
      throw new AIProviderError(
        `[ai-provider] Embedding dimension mismatch: expected ${config.dimensions}, got ${embeddings[0].length}.`,
        'UNKNOWN',
      );
    }

    emit({
      source: 'ai-provider',
      type: 'embedding.success',
      traceId,
      correlationId,
      userId,
      provider: config.provider,
      model: config.model,
      env: config.env,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      dimensions: config.dimensions,
      inputTokens: result.usage?.tokens ?? 0,
      batchSize: texts.length,
    });

    return {
      embeddings,
      model: config.model,
      dimensions: config.dimensions,
      provider: config.provider,
    };
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    const wrapped = wrapError(err, config.provider);
    emit({
      source: 'ai-provider',
      type: 'embedding.failure',
      traceId,
      correlationId,
      userId,
      provider: config.provider,
      model: config.model,
      env: config.env,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      error: { code: wrapped.code, message: wrapped.message },
    });
    throw wrapped;
  }
};

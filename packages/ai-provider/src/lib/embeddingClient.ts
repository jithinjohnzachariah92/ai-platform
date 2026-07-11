import { createVoyage } from '@ai-sdk/voyage';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel } from 'ai';
import type { EmbeddingProviderConfig } from './embeddingProvider.js';

// ── buildEmbeddingModel ───────────────────────────────────────────────────────
// Constructs the AI SDK embedding model instance for the resolved provider.
// Mirrors buildModel() in client.ts but for embeddings — different SDK function
// (textEmbeddingModel vs chat model), different provider set.
//
// inputType: 'document' for storing in pgvector, 'query' for similarity search.
// Voyage automatically prepends optimised prompts based on this — improves
// retrieval quality for RAG use cases.

export type EmbeddingInputType = 'query' | 'document';

export const buildEmbeddingModel = (
  config: EmbeddingProviderConfig,
  inputType: EmbeddingInputType = 'document',
): EmbeddingModel => {
  switch (config.provider) {
    case 'voyage': {
      if (!config.apiKey) {
        throw new Error(
          '[ai-provider] Voyage API key missing.\n' +
            'Set VOYAGE_API_KEY in your environment.\n' +
            'Get a key at: https://dash.voyageai.com',
        );
      }
      const voyage = createVoyage({ apiKey: config.apiKey });
      return voyage.textEmbeddingModel(config.model);
    }

    case 'openai': {
      if (!config.apiKey) {
        throw new Error(
          '[ai-provider] OpenAI API key missing.\n' +
            'Set OPENAI_API_KEY in your environment.\n' +
            'Get a key at: https://platform.openai.com/api-keys',
        );
      }
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai.textEmbeddingModel(config.model);
    }

    case 'ollama': {
      // Ollama uses the OpenAI-compatible endpoint at localhost
      const ollama = createOpenAI({
        apiKey: 'ollama', // Ollama doesn't require a real key
        baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
      });
      return ollama.textEmbeddingModel(config.model);
    }

    default: {
      throw new Error(
        `[ai-provider] Unknown embedding provider: ${config.provider}.\n` +
          `Valid options: voyage, openai, ollama.\n` +
          `Set AI_EMBED_PROVIDER in your environment.`,
      );
    }
  }
};

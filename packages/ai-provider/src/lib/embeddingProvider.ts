import type { EmbeddingProviderName, AIEnvironment } from '@jz92/ai-core'

// ── Embedding provider config ─────────────────────────────────────────────────
// Separate from ProviderConfig (completions) because:
// - different provider set (Voyage does embeddings, not completions)
// - different fields (dimensions instead of maxTokens, no usePromptCache)
// - Voyage in BOTH dev and prod (dimension consistency — see AI-CONCEPTS.md §7)

export type EmbeddingProviderConfig = {
  provider: EmbeddingProviderName
  model: string
  dimensions: number       // expected output dimensions — validated after each call
  env: AIEnvironment
  apiKey?: string          // resolved from env vars, not hardcoded
}

// Default models per provider
const EMBEDDING_DEFAULTS: Record<EmbeddingProviderName, { model: string; dimensions: number }> = {
  voyage: { model: 'voyage-4-lite', dimensions: 1024 },
  openai: { model: 'text-embedding-3-small', dimensions: 1536 },
  ollama: { model: 'nomic-embed-text', dimensions: 768 },
}

// ── resolveEmbeddingProvider ──────────────────────────────────────────────────
// Reads AI_EMBED_PROVIDER and AI_EMBED_MODEL from env.
// Defaults to Voyage in ALL environments — not env-switched like completions.
// Reason: embedding vectors from different models are incompatible (different
// dimensions + geometry). Switching providers between dev and prod would corrupt
// the pgvector store. One provider = one vector space = safe.

export const resolveEmbeddingProvider = (): EmbeddingProviderConfig => {
  const env = (process.env.NODE_ENV ?? 'development') as AIEnvironment
  const providerName = (process.env.AI_EMBED_PROVIDER ?? 'voyage') as EmbeddingProviderName
  const modelOverride = process.env.AI_EMBED_MODEL

  const defaults = EMBEDDING_DEFAULTS[providerName] ?? EMBEDDING_DEFAULTS.voyage
  const model = modelOverride ?? defaults.model
  const dimensions = defaults.dimensions

  return {
    provider: providerName,
    model,
    dimensions,
    env,
    apiKey: resolveApiKey(providerName),
  }
}

const resolveApiKey = (provider: EmbeddingProviderName): string | undefined => {
  switch (provider) {
    case 'voyage': return process.env.VOYAGE_API_KEY
    case 'openai': return process.env.OPENAI_API_KEY
    case 'ollama': return undefined   // local, no key needed
  }
}
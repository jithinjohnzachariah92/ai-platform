/**
 * @jz92/ai-provider
 *
 * Environment-aware AI provider for Next.js / Node portfolio projects.
 *
 * - development  → Ollama (local, free)
 * - test         → Anthropic Haiku (CI, minimal cost)
 * - production   → Anthropic Sonnet with prompt caching
 *
 * Usage:
 *   import { generateStructured, generatePlainText } from '@jz92/ai-provider'
 */

// ── Core capabilities ─────────────────────────────────────────────────────────
export { generateStructured, generatePlainText } from './lib/gateway.js'
export { resolveProvider } from './lib/provider.js'
export { responseCache } from './lib/cache.js'
export { AIProviderError } from './lib/errors.js'
export { onAIEvent } from './lib/observability.js'

// ── Types ─────────────────────────────────────────────────────────────────────
// AIProviderError's own code type stays in errors
export type { AIErrorCode } from './lib/errors.js'

// Event types — still in observability for now (will migrate to ai-core events in a follow-on)
export type { AIEvent, AIEventType } from './lib/observability.js'

// Implementation-specific types from types.ts
export type { ProviderConfig } from './lib/types.js'

// Backwards-compatible re-exports of ai-core types
// Consumers importing these from @jz92/ai-provider keep working unchanged
export type {
  AIProviderName,
  AIEnvironment,
  AIRequestOptions,
  AIResponse,
} from './lib/types.js'

// ── Embedding capabilities ────────────────────────────────────────────────────
export { generateEmbedding, generateEmbeddingBatch } from './lib/embeddingGateway.js'
export { resolveEmbeddingProvider } from './lib/embeddingProvider.js'
export type { EmbeddingProviderConfig } from './lib/embeddingProvider.js'
export type { EmbeddingInputType } from './lib/embeddingClient.js'
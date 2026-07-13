// @jz92/ai-core — contracts, event bus, and security utilities
// for the @jz92 AI platform. Zero runtime dependencies.

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  // Provider identity
  AIProviderName,
  EmbeddingProviderName,
  AIEnvironment,
  AIErrorCode,

  // Trace + cache context
  TraceContext,
  CacheContext,

  // Schema abstraction
  Schema,

  // Completion contracts
  CompletionRequest,
  CompletionResponse,

  // Embedding contracts
  EmbeddingRequest,
  EmbeddingBatchRequest,
  EmbeddingResponse,
  EmbeddingBatchResponse,

  // Vector store contracts
  VectorEntry,
  VectorQuery,
  VectorSearchResult,
  VectorStore, 
} from './lib/types.js'

// ── Event bus ─────────────────────────────────────────────────────────────────
export type { PlatformEvent } from './lib/events.js'
export { emit, onEvent, clearSubscribers } from './lib/events.js'

// ── Security ──────────────────────────────────────────────────────────────────
export {
  redact,
  redactFields,
  detectInjection,
  assertSafeInput,
  scrubSecrets,
  scrubObject,
} from './lib/security.js'

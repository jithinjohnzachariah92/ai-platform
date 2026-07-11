import type {
  AIProviderName,
  AIEnvironment,
  EmbeddingProviderName,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingBatchRequest,
  EmbeddingResponse,
  EmbeddingBatchResponse,
  TraceContext,
  CacheContext,
  Schema,
} from '@jz92/ai-core'

// Re-export ai-core types so existing consumers of @jz92/ai-provider
// don't need to change their imports — backwards compatible.
export type {
  AIProviderName,
  AIEnvironment,
  EmbeddingProviderName,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingBatchRequest,
  EmbeddingResponse,
  EmbeddingBatchResponse,
  TraceContext,
  CacheContext,
  Schema,
}

// ── ai-provider specific types ────────────────────────────────────────────────
// These are implementation details — they reference provider SDK internals
// and don't belong in ai-core's contracts layer.

export type ProviderConfig = {
  provider: AIProviderName
  model: string
  baseURL?: string
  maxTokens: number
  usePromptCache: boolean
  env: AIEnvironment
}

export type EmbeddingProviderConfig = {
  provider: EmbeddingProviderName
  model: string
  baseURL?: string
  dimensions: number
  env: AIEnvironment
}

// Backwards-compatible aliases — existing code using AIRequestOptions
// and AIResponse continues to work without changes.
export type AIRequestOptions<T = string> = CompletionRequest<T>
export type AIResponse<T> = CompletionResponse<T>
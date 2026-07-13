import type { VectorStore, TraceContext, EmbeddingProviderName } from '@jz92/ai-core'

// ── Embed function ────────────────────────────────────────────────────────────
// Injected rather than hard-imported from @jz92/ai-provider — keeps this
// package testable in isolation (fake embedder, no API calls) and, in
// principle, usable with any embedding source that satisfies this shape.

export type EmbedFn = (
  text: string,
  inputType: 'query' | 'document',
  traceId?: string
) => Promise<{ embedding: number[]; model: string; provider: EmbeddingProviderName }>

// ── RetrieverConfig ────────────────────────────────────────────────────────────
// Everything domain-specific is injected here — nothing about preferences,
// Mongo queries, or any other domain is hardcoded in this package.
//
// Validated against two known consumers before finalizing:
//   Preference Parser: T = ParsedPreferences (categories/dietary/events/style/brands)
//   NL2Mongo:           T = GeneratedQuery (filter/projection/sort/limit)
// Both are plain structured objects serialisable to JSON — the shape holds.

export type RetrieverConfig<T> = {
  vectorStore: VectorStore
  embed: EmbedFn
  topK: number
  formatExample: (input: string, output: T) => string
  parseOutput: (raw: string) => T

  // ── Guardrails (optional — default to no-op, matching pre-package behaviour) ─
  minScore?: number
  maxExampleTokens?: number
}

// ── Quality gate ───────────────────────────────────────────────────────────────

export type QualityGate<T> = (output: T) => boolean

// ── Retrieve result ────────────────────────────────────────────────────────────

export type RetrieveResult = {
  fewShotText: string
  exampleCount: number
  topScore?: number
}

// ── Store options ──────────────────────────────────────────────────────────────

export type StoreOptions = {
  model: string
  modelVersion: string
}

export type { TraceContext }
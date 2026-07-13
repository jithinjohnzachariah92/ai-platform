import type { VectorStore, TraceContext } from '@jz92/ai-core'

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
  topK: number
  formatExample: (input: string, output: T) => string
  parseOutput: (raw: string) => T

  // ── Guardrails (optional — default to no-op, matching pre-package behaviour) ─
  // Both are proven necessary (tc-07 finding: score 0.629 caused a
  // hallucination in the Preference Parser) but not yet tuned across a second
  // domain. Defaulting to "off" means adopting this package changes nothing
  // observable until you decide to tune these — a config change, not a code
  // change, when you do.

  // Minimum similarity score for an example to be injected at all.
  // Default 0 = no filtering (every top-K result injected regardless of
  // relevance — today's behaviour). Set e.g. 0.7 once tuned against real scores.
  minScore?: number

  // Hard ceiling on total few-shot token overhead, regardless of example count.
  // Default undefined = no budget (TOP_K alone bounds it — today's behaviour).
  // Set e.g. 300 once you've observed example sizes growing.
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
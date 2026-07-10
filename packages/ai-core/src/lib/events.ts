import type { AIEnvironment, AIErrorCode, AIProviderName, EmbeddingProviderName, CacheContext, TraceContext } from './types.js'

// ── Base event ────────────────────────────────────────────────────────────────
// Every event across every package carries this. The traceId/userId fields
// let you reconstruct the full lifecycle of any user action in your logs.

type BaseEvent = {
  // Trace — who/what triggered this
  traceId: string
  correlationId?: string
  userId?: string
  sessionId?: string

  // What emitted this
  source: 'ai-provider' | 'vector' | 'retrieval' | 'guardrails' | 'agents' | 'prompts' | 'evals'
  type: string

  // When + how long
  timestamp: string      // ISO 8601
  durationMs?: number

  // Where
  env: AIEnvironment
  packageVersion?: string  // which version of the package emitted this

  // Cache state at time of event
  cache?: CacheContext
} & TraceContext

// ── ai-provider events ────────────────────────────────────────────────────────

type CompletionSuccessEvent = BaseEvent & {
  source: 'ai-provider'
  type: 'completion.success'
  provider: AIProviderName
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
  }
}

type CompletionFailureEvent = BaseEvent & {
  source: 'ai-provider'
  type: 'completion.failure'
  provider: AIProviderName
  model: string
  error: { code: AIErrorCode; message: string }
  attempt: number
}

type CompletionRetryEvent = BaseEvent & {
  source: 'ai-provider'
  type: 'completion.retry'
  provider: AIProviderName
  model: string
  error: { code: AIErrorCode; message: string }
  attempt: number
}

type EmbeddingSuccessEvent = BaseEvent & {
  source: 'ai-provider'
  type: 'embedding.success'
  provider: EmbeddingProviderName
  model: string
  dimensions: number
  inputTokens: number
  batchSize?: number     // present on batch calls
}

type EmbeddingFailureEvent = BaseEvent & {
  source: 'ai-provider'
  type: 'embedding.failure'
  provider: EmbeddingProviderName
  model: string
  error: { code: AIErrorCode; message: string }
}

type CacheHitEvent = BaseEvent & {
  source: 'ai-provider'
  type: 'cache.hit'
  provider: AIProviderName | EmbeddingProviderName
  model: string
  cache: CacheContext
}

// ── vector events ─────────────────────────────────────────────────────────────

type VectorSearchEvent = BaseEvent & {
  source: 'vector'
  type: 'search.success' | 'search.empty'
  table: string          // which domain's table — preferences_examples, nl2mongo_examples
  topK: number
  returned: number       // actual results (may be < topK if store is sparse)
  topScore?: number      // highest similarity score — signals retrieval quality
}

type VectorInsertEvent = BaseEvent & {
  source: 'vector'
  type: 'insert.success'
  table: string
  model: string
  dimensions: number
}

// ── retrieval events ──────────────────────────────────────────────────────────

type RetrievalEvent = BaseEvent & {
  source: 'retrieval'
  type: 'retrieved' | 'quality.gate.passed' | 'quality.gate.failed'
  count?: number
  topScore?: number
  reason?: string        // for quality.gate.failed — why it was rejected
}

// ── guardrail events ──────────────────────────────────────────────────────────
// Emitted from domain code (not a platform package) — but typed here so the
// subscriber gets a consistent shape regardless of which domain emitted it.

type GuardrailEvent = BaseEvent & {
  source: 'guardrails'
  type: 'hallucination.dropped' | 'empty.result' | 'low.confidence' | 'input.rejected'
  items?: string[]       // what was dropped or flagged
  reason?: string
}

// ── agent events ──────────────────────────────────────────────────────────────

type AgentEvent = BaseEvent & {
  source: 'agents'
  type: 'step.start' | 'step.complete' | 'plan.created' | 'loop.complete' | 'loop.failed'
  step?: string
  totalSteps?: number
  attempt?: number
}

// ── The discriminated union ───────────────────────────────────────────────────
// The subscriber receives one of these. TypeScript narrows the type based on
// source + type so you get full autocomplete inside switch/if blocks:
//
//   onEvent((event) => {
//     if (event.source === 'ai-provider' && event.type === 'completion.success') {
//       event.usage.inputTokens  // ← TypeScript knows this exists
//     }
//   })

export type PlatformEvent =
  | CompletionSuccessEvent
  | CompletionFailureEvent
  | CompletionRetryEvent
  | EmbeddingSuccessEvent
  | EmbeddingFailureEvent
  | CacheHitEvent
  | VectorSearchEvent
  | VectorInsertEvent
  | RetrievalEvent
  | GuardrailEvent
  | AgentEvent
  
// ── Event bus ─────────────────────────────────────────────────────────────────
// A minimal pub/sub mechanism. Zero external dependencies — just an array of
// subscribers. Every @jz92/* package calls emit(); the application subscribes
// once and gets the full lifecycle of every request across all layers.
//
// Design decisions:
//   - Module-level singleton: one bus per process, shared across all packages
//   - Subscriber errors are swallowed: a broken logger never crashes a request
//   - onEvent returns an unsubscribe fn: important for test cleanup

type Subscriber = (event: PlatformEvent) => void

let subscribers: Subscriber[] = []

export const emit = (event: PlatformEvent): void => {
  for (const sub of subscribers) {
    try { sub(event) } catch { /* never let a subscriber crash the request */ }
  }
}

export const onEvent = (subscriber: Subscriber): (() => void) => {
  subscribers.push(subscriber)
  return () => {
    subscribers = subscribers.filter(s => s !== subscriber)
  }
}

export const clearSubscribers = (): void => {
  subscribers = []   // for test cleanup — avoids subscriber bleed between tests
}


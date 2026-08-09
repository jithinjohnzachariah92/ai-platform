import type {
  AIEnvironment,
  AIErrorCode,
  AIProviderName,
  EmbeddingProviderName,
  CacheContext,
  TraceContext,
} from './types.js';

// ── Base event ────────────────────────────────────────────────────────────────
// Every event across every package carries this. The traceId/userId fields
// let you reconstruct the full lifecycle of any user action in your logs.

type BaseEvent = {
  // Trace — who/what triggered this
  traceId: string;
  correlationId?: string;
  userId?: string;
  sessionId?: string;

  // What emitted this
  source:
    | 'ai-provider'
    | 'vector'
    | 'retrieval'
    | 'guardrails'
    | 'agents'
    | 'prompts'
    | 'evals'
    | 'tools';
  type: string;

  // When + how long
  timestamp: string; // ISO 8601
  durationMs?: number;

  // Where
  env: AIEnvironment;
  packageVersion?: string; // which version of the package emitted this

  // Cache state at time of event
  cache?: CacheContext;
} & TraceContext;

// ── ai-provider events ────────────────────────────────────────────────────────

type CompletionSuccessEvent = BaseEvent & {
  source: 'ai-provider';
  type: 'completion.success';
  provider: AIProviderName;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
};

type CompletionFailureEvent = BaseEvent & {
  source: 'ai-provider';
  type: 'completion.failure';
  provider: AIProviderName;
  model: string;
  error: { code: AIErrorCode; message: string };
  attempt: number;
};

type CompletionRetryEvent = BaseEvent & {
  source: 'ai-provider';
  type: 'completion.retry';
  provider: AIProviderName;
  model: string;
  error: { code: AIErrorCode; message: string };
  attempt: number;
};

type EmbeddingSuccessEvent = BaseEvent & {
  source: 'ai-provider';
  type: 'embedding.success';
  provider: EmbeddingProviderName;
  model: string;
  dimensions: number;
  inputTokens: number;
  batchSize?: number; // present on batch calls
};

type EmbeddingFailureEvent = BaseEvent & {
  source: 'ai-provider';
  type: 'embedding.failure';
  provider: EmbeddingProviderName;
  model: string;
  error: { code: AIErrorCode; message: string };
};

type CompletionCacheHitEvent = BaseEvent & {
  source: 'ai-provider';
  type: 'completion.cache.hit';
  provider: AIProviderName;
  model: string;
  cache: CacheContext;
};

type EmbeddingCacheHitEvent = BaseEvent & {
  source: 'ai-provider';
  type: 'embedding.cache.hit';
  provider: EmbeddingProviderName;
  model: string;
  cache: CacheContext;
};
// ── vector events ─────────────────────────────────────────────────────────────

type VectorSearchEvent = BaseEvent & {
  source: 'vector';
  type: 'search.success' | 'search.empty';
  table: string;
  topK: number;
  returned: number;
  topScore?: number;
};

type VectorSearchFailureEvent = BaseEvent & {
  source: 'vector';
  type: 'search.failure';
  table: string;
  topK: number;
  error: { code: AIErrorCode; message: string };
};

type VectorInsertEvent = BaseEvent & {
  source: 'vector';
  type: 'insert.success';
  table: string;
  model: string;
  dimensions: number;
};

type VectorInsertFailureEvent = BaseEvent & {
  source: 'vector';
  type: 'insert.failure';
  table: string;
  error: { code: AIErrorCode; message: string };
};

type VectorDeleteEvent = BaseEvent & {
  source: 'vector';
  type: 'delete.success' | 'delete.failure';
  table: string;
  error?: { code: AIErrorCode; message: string };
};

// ── retrieval events ──────────────────────────────────────────────────────────

type RetrievalEvent = BaseEvent & {
  source: 'retrieval'
  type: 'retrieved' | 'quality.gate.passed' | 'quality.gate.failed'
  domain: string
  count?: number
  topScore?: number
  reason?: string
}

type RetrievalStoreEvent = BaseEvent & {
  source: 'retrieval'
  type: 'store.success' | 'store.failure'
  domain: string
  reason?: string
}

// ── guardrail events ──────────────────────────────────────────────────────────
// Emitted from domain code (not a platform package) — but typed here so the
// subscriber gets a consistent shape regardless of which domain emitted it.

type GuardrailEvent = BaseEvent & {
  source: 'guardrails';
  type:
    | 'hallucination.dropped'
    | 'empty.result'
    | 'low.confidence'
    | 'input.rejected';
  items?: string[]; // what was dropped or flagged
  reason?: string;
};

// ── agent events ──────────────────────────────────────────────────────────────
// Covers the full ReAct loop: observe → think/plan → act → reflect, plus a
// self-critique sub-step and the max-iteration guard. Each stage gets its own
// start/complete pair (same entry/exit discipline as every other package),
// so a subscriber can see exactly which stage is running and how long it took.

type AgentEvent = BaseEvent & {
  source: 'agents'
  type:
    | 'observe.start' | 'observe.complete'
    | 'think.start' | 'think.complete'
    | 'act.start' | 'act.complete' | 'act.failed'
    | 'reflect.start' | 'reflect.complete'
    | 'critique.start' | 'critique.complete' | 'critique.revised'
    | 'loop.iteration' | 'loop.max_iterations_exceeded'
    | 'loop.complete' | 'loop.failed'
  domain: string          // which agent/task this belongs to, e.g. 'toy-task-demo'
                           // — same reasoning as retrieval's domain field: multiple
                           // agent tasks will eventually share this event shape
  iteration?: number       // which loop iteration this event belongs to
  maxIterations?: number
  step?: string            // human-readable description of what this step did
  reason?: string          // why a step failed, or why critique revised the output
}

// ── tool events ────────────────────────────────────────────────────────────────
// Distinct from AgentEvent — the agent deciding to call a tool (agents.act.*)
// is a different concern from the tool actually executing (tools.call.*), same
// separation already established between retrieval (the decision to
// retrieve/store) and vector (the actual DB operation).

type ToolEvent = BaseEvent & {
  source: 'tools'
  type:
    | 'call.start' | 'call.success'
    | 'call.input_invalid' | 'call.output_invalid'
    | 'call.failure'
  toolName: string
  domain: string
  invocationKind: 'function' | 'mcp' | 'api' | 'cli'
  reason?: string
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
  | CompletionCacheHitEvent
  | EmbeddingCacheHitEvent
  | VectorSearchEvent
  | VectorSearchFailureEvent
  | VectorInsertEvent
  | VectorInsertFailureEvent
  | VectorDeleteEvent
  | RetrievalEvent
  | RetrievalStoreEvent
  | GuardrailEvent
  | AgentEvent
  | ToolEvent;

type Subscriber = (event: PlatformEvent) => void;

// ── Event bus ─────────────────────────────────────────────────────────────────
// Uses globalThis rather than a module-level variable. Bundlers (Next.js,
// Turbopack, webpack) can load this module in separate bundle contexts —
// e.g. the instrumentation runtime vs an API route — each getting its own
// module scope with its own copy of `subscribers`. A module-level array
// would silently split into two buses that never see each other's events.
// globalThis is shared across all bundles in the same process, so this
// guarantees one true singleton bus regardless of how the bundler splits code.

const GLOBAL_KEY = '__jz92AiCoreSubscribers__';

type GlobalWithSubscribers = typeof globalThis & {
  [GLOBAL_KEY]?: Subscriber[];
};

const getSubscribers = (): Subscriber[] => {
  const g = globalThis as GlobalWithSubscribers;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = [];
  return g[GLOBAL_KEY];
};

export const emit = (event: PlatformEvent): void => {
  for (const sub of getSubscribers()) {
    try {
      sub(event);
    } catch {
      /* never let a subscriber crash the request */
    }
  }
};

export const onEvent = (subscriber: Subscriber): (() => void) => {
  const subs = getSubscribers();
  subs.push(subscriber);
  return () => {
    const g = globalThis as GlobalWithSubscribers;
    g[GLOBAL_KEY] = getSubscribers().filter((s) => s !== subscriber);
  };
};

export const clearSubscribers = (): void => {
  (globalThis as GlobalWithSubscribers)[GLOBAL_KEY] = [];
};

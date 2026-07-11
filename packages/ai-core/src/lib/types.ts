// ── Provider identity ─────────────────────────────────────────────────────────

export type AIProviderName =
  | 'ollama'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'groq'
  | 'mistral';

export type EmbeddingProviderName = 'voyage' | 'openai' | 'ollama';

export type AIEnvironment = 'development' | 'test' | 'production';

export type AIErrorCode =
  | 'AUTH_ERROR'          // 401 — bad key, never retry
  | 'BILLING_ERROR'       // 402/403 — no credits, never retry
  | 'RATE_LIMIT'          // 429 — retry with backoff
  | 'SERVER_ERROR'        // 500/502/503 — retry
  | 'TIMEOUT'             // request hung — retry once
  | 'MODEL_NOT_FOUND'     // 404 — model not pulled locally
  | 'TOKEN_BUDGET'        // input too large — never retry
  | 'SCHEMA_VALIDATION'   // output didn't match schema — retry once
  | 'UNKNOWN'             // anything else

// ── Trace context ─────────────────────────────────────────────────────────────

export type TraceContext = {
  traceId?: string       // optional — not every call site generates a trace
  correlationId?: string
  userId?: string
  sessionId?: string
}

// ── Cache context ─────────────────────────────────────────────────────────────

export type CacheContext = {
  layer: 'app-cache' | 'provider-cache' | 'none';
  key?: string;
  hit: boolean;
  hitRate?: number;
};

// ── Schema abstraction ────────────────────────────────────────────────────────

export interface Schema<T> {
  parse(value: unknown): T
}

// ── Completion contracts ──────────────────────────────────────────────────────

export type CompletionRequest<T = string> = {
  prompt: string
  systemPrompt: string
  schema?: Schema<T>
  cacheKey?: string
  maxInputTokens?: number
} & TraceContext

export type CompletionResponse<T> = {
  data: T
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
  }
  provider: AIProviderName
  model: string
  fromCache: boolean
}

// ── Embedding contracts ───────────────────────────────────────────────────────
// Text in, vector out. Different from completions — the output is a number[]
// not text. model + dimensions are non-negotiable fields: they get written to
// pgvector alongside every stored vector so mismatches are caught before they
// corrupt the store.

export type EmbeddingRequest = {
  text: string
  cacheKey?: string
} & TraceContext

export type EmbeddingBatchRequest = {
  texts: string[]
} & TraceContext

export type EmbeddingResponse = {
  embedding: number[]
  model: string        // which model produced this vector — critical for store integrity
  dimensions: number   // length of the vector — catches dev/prod mismatches early
  provider: EmbeddingProviderName
  fromCache: boolean
}

export type EmbeddingBatchResponse = {
  embeddings: number[][]
  model: string
  dimensions: number
  provider: EmbeddingProviderName
}

// ── Vector store contracts ────────────────────────────────────────────────────
// ai-core owns the shape; @jz92/vector owns the implementation.
// Defined here so vector, retrieval, and agents can all import the same types
// without depending on @jz92/vector (which would create circular deps).

export type VectorEntry = {
  id?: string
  embedding: number[]
  input: string            // the original text that was embedded
  output: string           // the validated good output — what gets retrieved as a few-shot example
  model: string            // which embedding model produced this vector
  modelVersion: string     // version string — for future migration if model changes
  createdAt?: Date
}

export type VectorQuery = {
  embedding: number[]      // the query vector — embed the input first, then search
  topK: number             // how many results to return
  threshold?: number       // minimum similarity score — filter out weak matches
  filter?: Record<string, unknown>  // metadata filters (e.g. only search this domain's entries)
}

export type VectorSearchResult = {
  entry: VectorEntry
  score: number            // similarity score 0-1 — higher = more similar
}
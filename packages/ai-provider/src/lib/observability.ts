/// <reference types="node" />

import { CacheStats } from "./cache.js"
import { emit } from '@jz92/ai-core'
import type { AIProviderName, AIErrorCode, AIEnvironment, PlatformEvent } from '@jz92/ai-core'

/**
 * Observability layer.
 *
 * The package emits structured events for every request via two paths:
 *
 * 1. The legacy `onAIEvent` handler (backwards compatible — unchanged
 *    behaviour for any existing consumer registered this way).
 * 2. `@jz92/ai-core`'s event bus (`emit`/`onEvent`) — every event is also
 *    translated into a PlatformEvent and forwarded here, so subscribers
 *    using the platform-wide bus see ai-provider's events alongside
 *    vector/retrieval events, all sharing traceId.
 *
 * Usage in the consumer app (either or both, once, at startup):
 *
 *   import { onAIEvent } from '@jz92/ai-provider'
 *   onAIEvent((event) => { logger.info({ source: 'ai-provider', ...event }) })
 *
 *   import { onEvent } from '@jz92/ai-core'
 *   onEvent((event) => { ... })   // sees ai-provider + vector + retrieval events
 */

export type AIEventType =
  | 'request.success'
  | 'request.failure'
  | 'request.retry'
  | 'cache.hit'

export type AIEvent = {
  type: AIEventType
  timestamp: string
  provider: string
  model: string
  env: string
  durationMs?: number
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }
  error?: { code: string; message: string }
  attempt?: number
  correlationId?: string
  cacheStats?: CacheStats
}

type AIEventHandler = (event: AIEvent) => void

const GLOBAL_KEY = '__aiProviderEventHandler__'

type GlobalWithHandler = typeof globalThis & {
  [GLOBAL_KEY]?: AIEventHandler | null
}

export function onAIEvent(fn: AIEventHandler): void {
  (globalThis as GlobalWithHandler)[GLOBAL_KEY] = fn
}

// ── Translation: legacy AIEvent → ai-core PlatformEvent ───────────────────────
// Best-effort mapping. Fields not carried by the legacy shape (e.g. dimensions
// on embedding events aren't relevant here — this file only ever saw
// completion-type events) get sensible defaults rather than crashing.

const toPlatformEvent = (event: AIEvent): PlatformEvent | null => {
  const traceId = event.correlationId ?? ''
  const env = (event.env as AIEnvironment) ?? 'development'
  const provider = event.provider as AIProviderName

  switch (event.type) {
    case 'request.success':
      return {
        source: 'ai-provider', type: 'completion.success',
        traceId, correlationId: event.correlationId,
        timestamp: event.timestamp, durationMs: event.durationMs,
        env, provider, model: event.model,
        usage: event.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      }
    case 'request.failure':
      return {
        source: 'ai-provider', type: 'completion.failure',
        traceId, correlationId: event.correlationId,
        timestamp: event.timestamp, durationMs: event.durationMs,
        env, provider, model: event.model,
        error: { code: (event.error?.code as AIErrorCode) ?? 'UNKNOWN', message: event.error?.message ?? 'unknown error' },
        attempt: event.attempt ?? 0,
      }
    case 'request.retry':
      return {
        source: 'ai-provider', type: 'completion.retry',
        traceId, correlationId: event.correlationId,
        timestamp: event.timestamp, durationMs: event.durationMs,
        env, provider, model: event.model,
        error: { code: (event.error?.code as AIErrorCode) ?? 'UNKNOWN', message: event.error?.message ?? 'unknown error' },
        attempt: event.attempt ?? 0,
      }
    case 'cache.hit':
      return {
        source: 'ai-provider', type: 'cache.hit',
        traceId, correlationId: event.correlationId,
        timestamp: event.timestamp, durationMs: event.durationMs,
        env, provider, model: event.model,
        cache: { layer: 'app-cache', hit: true, hitRate: event.cacheStats?.hitRate },
      }
    default:
      return null
  }
}

export function emitEvent(event: AIEvent): void {
  const handler = (globalThis as GlobalWithHandler)[GLOBAL_KEY]

  if (handler) {
    try {
      handler(event)
    } catch (err) {
      console.error('[ai-provider] event handler threw:', err)
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify({ source: 'ai-provider', ...event }))
  } else if (event.type === 'request.failure') {
    console.error(
      `[ai-provider] ${event.error?.code} after ${event.durationMs}ms ` +
      `(${event.provider}/${event.model}): ${event.error?.message}`
    )
  }

  // Always forward to ai-core's bus, regardless of whether a legacy
  // handler is registered — this is what makes ai-provider's events
  // visible to platform-wide subscribers (instrumentation.ts, the future
  // live visualizer) alongside vector/retrieval events.
  const platformEvent = toPlatformEvent(event)
  if (platformEvent) {
    try {
      emit(platformEvent)
    } catch (err) {
      console.error('[ai-provider] failed to forward event to ai-core bus:', err)
    }
  }
}
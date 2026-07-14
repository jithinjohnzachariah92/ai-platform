import { onEvent } from '@jz92/ai-core'
import type { PlatformEvent } from '@jz92/ai-core'

// ── Default stage labels ──────────────────────────────────────────────────────
// Covers every event type the platform currently emits. Apps can extend or
// override via attachTraceSummary({ labels: {...} }) without needing to fork
// this package — e.g. once @jz92/agents exists and emits 'agents.step.start'.

const DEFAULT_LABELS: Record<string, string> = {
  'ai-provider.completion.success': 'llm completion',
  'ai-provider.completion.failure': 'llm completion (failed)',
  'ai-provider.completion.retry':   'llm completion (retry)',
  'ai-provider.embedding.success':  'embed text',
  'ai-provider.embedding.failure':  'embed text (failed)',
  'ai-provider.completion.cache.hit': 'completion cache hit',
  'ai-provider.embedding.cache.hit':  'embedding cache hit',
  'vector.search.success':          'vector search',
  'vector.search.empty':            'vector search (empty)',
  'vector.search.failure':          'vector search (failed)',
  'vector.insert.success':          'vector insert',
  'vector.insert.failure':          'vector insert (failed)',
  'vector.delete.success':          'vector delete',
  'vector.delete.failure':          'vector delete (failed)',
  'retrieval.retrieved':            'retrieval (embed+search+format)',
  'retrieval.quality.gate.passed':  'quality gate',
  'retrieval.quality.gate.failed':  'quality gate (rejected)',
  'retrieval.store.success':        'store example',
  'retrieval.store.failure':        'store example (failed)',
}

export type TraceSummaryConfig = {
  labels?: Record<string, string>
  maxBufferAgeMs?: number
}

type BufferedTrace = { events: PlatformEvent[]; firstSeenAt: number }

const GLOBAL_KEY = '__jz92TelemetryBuffers__'

type GlobalWithBuffers = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, BufferedTrace>
}

const getBuffers = (): Map<string, BufferedTrace> => {
  const g = globalThis as GlobalWithBuffers
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map()
  return g[GLOBAL_KEY]
}

let attached = false
let activeConfig: TraceSummaryConfig = {}

export const attachTraceSummary = (config: TraceSummaryConfig = {}): void => {
  activeConfig = config
  if (attached) return
  attached = true

  onEvent((event) => {
    if (!event.traceId) return
    const buffers = getBuffers()
    const existing = buffers.get(event.traceId)
    if (existing) {
      existing.events.push(event)
    } else {
      buffers.set(event.traceId, { events: [event], firstSeenAt: Date.now() })
    }
    pruneStaleBuffers(config.maxBufferAgeMs ?? 5 * 60 * 1000)
  })
}

const pruneStaleBuffers = (maxAgeMs: number): void => {
  const now = Date.now()
  for (const [traceId, buf] of getBuffers()) {
    if (now - buf.firstSeenAt > maxAgeMs) getBuffers().delete(traceId)
  }
}

export const printTraceSummary = (traceId: string): void => {
  const buffers = getBuffers()
  const buf = buffers.get(traceId)
  buffers.delete(traceId)
  if (!buf || buf.events.length === 0) return

  const labels = { ...DEFAULT_LABELS, ...activeConfig.labels }
  const sorted = [...buf.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const firstStart = new Date(sorted[0].timestamp).getTime()
  const last = sorted[sorted.length - 1]
  const lastEnd = new Date(last.timestamp).getTime() + (last.durationMs ?? 0)
  const totalMs = Math.max(0, lastEnd - firstStart)

  const stages = sorted
    .map((e) => ({ key: `${e.source}.${e.type}`, ms: e.durationMs ?? 0 }))
    .filter((s) => labels[s.key] !== undefined)
    .map((s) => ({ label: labels[s.key], ms: s.ms }))

  const width = 45
  const bar = (c: string) => `[trace] ${c}${'─'.repeat(width)}${c === '┌' ? '┐' : '┘'}`
  const line = (l: string, v: string) => {
    const content = `  ${l.padEnd(26)} ${v}`
    const pad = width - content.length - 1
    return `[trace] │${content}${' '.repeat(Math.max(0, pad))}│`
  }

  console.log(bar('┌'))
  console.log(line('total', `${totalMs}ms`))
  for (const s of stages) {
    const pct = totalMs > 0 ? Math.round((s.ms / totalMs) * 100) : 0
    console.log(line(s.label, `${s.ms}ms (${pct}%)`))
  }
  console.log(bar('└'))
}

export const _resetTelemetryState = (): void => {
  attached = false
  activeConfig = {}
  getBuffers().clear()
}
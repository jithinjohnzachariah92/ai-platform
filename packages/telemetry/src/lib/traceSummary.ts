import { onEvent } from '@jz92/ai-core'
import type { PlatformEvent } from '@jz92/ai-core'

// ── Stage hierarchy ────────────────────────────────────────────────────────────
// Some events are composites that already include others' time (e.g.
// retrieval.retrieved wraps ai-provider.embedding.success + vector.search.success).
// Composites are shown as parent rows with their known children in a nested
// box — children are NOT counted toward the total-percentage math, since
// that's computed only over genuinely additive, non-overlapping top-level costs.

type StageNode = {
  key: string
  label: string
  children?: string[]
}


const STAGE_HIERARCHY: StageNode[] = [
  {
    key: 'retrieval.retrieved',
    label: 'retrieval',
    children: ['ai-provider.embedding.success', 'vector.search.success', 'vector.search.empty'],
  },
  { key: 'ai-provider.completion.success', label: 'llm completion' },
  { key: 'retrieval.quality.gate.passed', label: 'quality gate' },
  { key: 'retrieval.quality.gate.failed', label: 'quality gate (rejected)' },
  {
    key: 'retrieval.store.success',
    label: 'store example',
    children: ['ai-provider.embedding.success', 'vector.insert.success'],
  },
  { key: 'retrieval.store.failure', label: 'store example (failed)' },
  { key: 'ai-provider.completion.cache.hit', label: 'completion cache hit' },
  { key: 'ai-provider.embedding.cache.hit', label: 'embedding cache hit' },
]

const CHILD_LABELS: Record<string, string> = {
  'ai-provider.embedding.success': 'embed text',
  'ai-provider.embedding.failure': 'embed text (failed)',
  'vector.search.success':         'vector search',
  'vector.search.empty':           'vector search (empty)',
  'vector.search.failure':         'vector search (failed)',
  'vector.insert.success':         'vector insert',
  'vector.insert.failure':         'vector insert (failed)',
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

  const sorted = [...buf.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const firstStart = new Date(sorted[0].timestamp).getTime()
  const last = sorted[sorted.length - 1]
  const lastEnd = new Date(last.timestamp).getTime() + (last.durationMs ?? 0)
  const totalMs = Math.max(0, lastEnd - firstStart)

  const byKey = new Map<string, PlatformEvent[]>()
  for (const e of sorted) {
    const key = `${e.source}.${e.type}`
    const arr = byKey.get(key) ?? []
    arr.push(e)
    byKey.set(key, arr)
  }

  const consumedAsChild = new Set<string>()
  const rows: { label: string; ms: number; indent: boolean }[] = []

  for (const node of STAGE_HIERARCHY) {
    const events = byKey.get(node.key)
    if (!events) continue

    for (const e of events) {
      rows.push({ label: node.label, ms: e.durationMs ?? 0, indent: false })

      for (const childKey of node.children ?? []) {
        const childEvents = byKey.get(childKey)
        if (!childEvents) continue
        consumedAsChild.add(childKey)
        for (const ce of childEvents) {
          rows.push({ label: CHILD_LABELS[childKey] ?? childKey, ms: ce.durationMs ?? 0, indent: true })
        }
      }
    }
  }

  // Any event key not covered by the hierarchy at all (unknown/future event
  // types) still shows up as a top-level row — nothing is silently dropped.
  for (const [key, events] of byKey) {
    if (consumedAsChild.has(key)) continue
    if (STAGE_HIERARCHY.some(n => n.key === key)) continue
    for (const e of events) {
      rows.push({ label: activeConfig.labels?.[key] ?? key, ms: e.durationMs ?? 0, indent: false })
    }
  }

  // Percentage is computed only over top-level (non-indented) rows, since
  // those are the genuinely additive, non-overlapping costs.
  const topLevelTotal = rows.filter(r => !r.indent).reduce((sum, r) => sum + r.ms, 0)

  const width = 47
  const bar = (c: string) => `[trace] ${c}${'─'.repeat(width)}${c === '┌' ? '┐' : '┘'}`
  const line = (l: string, v: string, indent: boolean) => {
    const prefix = indent ? '  ↳ ' : '  '
    const content = `${prefix}${l.padEnd(indent ? 24 : 26)} ${v}`
    const pad = width - content.length - 1
    return `[trace] │${content}${' '.repeat(Math.max(0, pad))}│`
  }

  console.log(bar('┌'))
  console.log(line('total', `${totalMs}ms`, false))
  for (const r of rows) {
    const pct = !r.indent && topLevelTotal > 0 ? ` (${Math.round((r.ms / topLevelTotal) * 100)}%)` : ''
    console.log(line(r.label, `${r.ms}ms${pct}`, r.indent))
  }
  console.log(bar('└'))
}

export const _resetTelemetryState = (): void => {
  attached = false
  activeConfig = {}
  getBuffers().clear()
}
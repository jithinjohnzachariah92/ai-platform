import { emit, clearSubscribers } from '@jz92/ai-core'
import type { PlatformEvent } from '@jz92/ai-core'
import { attachTraceSummary, printTraceSummary, _resetTelemetryState } from '../src/lib/traceSummary.js'

let passed = 0
let failed = 0

const log = (condition: boolean, label: string, detail?: string) => {
  if (condition) {
    console.log(`  ✓  ${label}`)
    passed++
  } else {
    console.log(`  ✗  ${label}${detail ? `\n     ${detail}` : ''}`)
    failed++
  }
}

// Capture console.log output for a block of code
const captureConsole = async (fn: () => void | Promise<void>): Promise<string[]> => {
  const lines: string[] = []
  const original = console.log
  console.log = (msg: string) => lines.push(msg)
  try {
    await fn()
  } finally {
    console.log = original
  }
  return lines
}

const fakeEvent = (overrides: Partial<PlatformEvent>): PlatformEvent => ({
  source: 'ai-provider',
  type: 'completion.success',
  traceId: 'test-trace',
  timestamp: new Date().toISOString(),
  env: 'development',
  provider: 'ollama',
  model: 'test-model',
  durationMs: 100,
  usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
  ...overrides,
} as PlatformEvent)

// ── attachTraceSummary — buffers events by traceId ────────────────────────────
console.log('\nattachTraceSummary — buffering')
{
  clearSubscribers()
  _resetTelemetryState()
  attachTraceSummary()

  emit(fakeEvent({ traceId: 'trace-a', durationMs: 50 }))
  emit(fakeEvent({ traceId: 'trace-a', source: 'vector', type: 'search.success', durationMs: 30 } as any))
  emit(fakeEvent({ traceId: 'trace-b', durationMs: 999 }))

  const lines = await captureConsole(() => printTraceSummary('trace-a'))
  log(lines.length > 0, 'printTraceSummary produces output for a buffered trace')
  log(lines.some(l => l.includes('total')), 'output includes a total line')

  const linesB = await captureConsole(() => printTraceSummary('trace-b'))
  log(linesB.length > 0, 'separate traceIds are buffered independently')
}

// ── printTraceSummary clears the buffer after printing ────────────────────────
console.log('\nprintTraceSummary — buffer cleanup')
{
  clearSubscribers()
  _resetTelemetryState()
  attachTraceSummary()

  emit(fakeEvent({ traceId: 'trace-c' }))
  await captureConsole(() => printTraceSummary('trace-c'))
  const secondCall = await captureConsole(() => printTraceSummary('trace-c'))
  log(secondCall.length === 0, 'printing twice for the same traceId is a no-op the second time')
}

// ── attachTraceSummary — double-attach guard ───────────────────────────────────
console.log('\nattachTraceSummary — double-attach guard')
{
  clearSubscribers()
  _resetTelemetryState()
  attachTraceSummary()
  attachTraceSummary()   // second call should not double-subscribe

  emit(fakeEvent({ traceId: 'trace-d', durationMs: 40 }))
  const lines = await captureConsole(() => printTraceSummary('trace-d'))
  const totalLine = lines.find(l => l.includes('total'))
  log(totalLine !== undefined && !totalLine.includes('80ms'), 'double-attach does not duplicate buffered events (no doubled duration)')
}

// ── printTraceSummary — unknown traceId is a safe no-op ────────────────────────
console.log('\nprintTraceSummary — unknown traceId')
{
  clearSubscribers()
  _resetTelemetryState()
  attachTraceSummary()

  const lines = await captureConsole(() => printTraceSummary('never-seen-trace'))
  log(lines.length === 0, 'printing an unbuffered traceId produces no output, does not throw')
}

// ── labels config — custom labels merge with defaults ──────────────────────────
console.log('\nlabels config — custom overrides')
{
  clearSubscribers()
  _resetTelemetryState()
  attachTraceSummary({ labels: { 'agents.step.start': 'custom agent step' } })

  emit(fakeEvent({ traceId: 'trace-e', source: 'agents', type: 'step.start', durationMs: 20 } as any))
  const lines = await captureConsole(() => printTraceSummary('trace-e'))
  log(lines.some(l => l.includes('custom agent step')), 'custom label config is honoured')
}

// ── events without traceId are ignored ─────────────────────────────────────────
console.log('\nevents without traceId')
{
  clearSubscribers()
  _resetTelemetryState()
  attachTraceSummary()

  emit(fakeEvent({ traceId: '' }))
  const lines = await captureConsole(() => printTraceSummary(''))
  log(lines.length === 0, 'events with empty traceId are not buffered')
}

// ── nested composite grouping ──────────────────────────────────────────────────
console.log('\nnested composite grouping')
{
  clearSubscribers()
  _resetTelemetryState()
  attachTraceSummary()

  emit(fakeEvent({ traceId: 'trace-nest', source: 'retrieval', type: 'retrieved', durationMs: 500 } as any))
  emit(fakeEvent({ traceId: 'trace-nest', source: 'ai-provider', type: 'embedding.success', durationMs: 400 } as any))
  emit(fakeEvent({ traceId: 'trace-nest', source: 'vector', type: 'search.success', durationMs: 60 } as any))
  emit(fakeEvent({ traceId: 'trace-nest', source: 'ai-provider', type: 'completion.success', durationMs: 8000 } as any))

  const lines = await captureConsole(() => printTraceSummary('trace-nest'))

  log(lines.some(l => l.includes('retrieval')), 'parent stage (retrieval) is shown')
  log(lines.some(l => l.includes('embed text')), 'child (embed text) is shown nested')
  log(lines.some(l => l.includes('vector search')), 'child (vector search) is shown nested')
  log(lines.some(l => l.includes('llm completion')), 'sibling top-level stage (llm completion) is shown')

  // Percentage should be computed over top-level only (500 + 8000 = 8500),
  // not inflated by double-counting the 400+60ms children.
  const retrievalLine = lines.find(l => l.includes('retrieval') && l.includes('%'))
  log(retrievalLine?.includes('(6%)') ?? false, 'retrieval percentage computed from top-level total only (500/8500 ≈ 6%)')
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────')
console.log(`  ${passed} passed  ${failed > 0 ? `${failed} failed` : ''}`)
console.log('────────────────────────────────────────\n')

process.exit(failed > 0 ? 1 : 0)
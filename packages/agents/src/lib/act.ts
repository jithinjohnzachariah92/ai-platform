import { emit } from '@jz92/ai-core'
import type { AIEnvironment } from '@jz92/ai-core'
import type { AgentState } from './types.js'
import type { ThinkResult } from './think.js'

const getEnv = (): AIEnvironment => (process.env.NODE_ENV as AIEnvironment) ?? 'development'

export type ActResult = {
  state: AgentState
  toolExecuted: boolean   // false this phase — always. Real execution lands in Phase 2.
}

// ── act ────────────────────────────────────────────────────────────────────────
// Execution stub. No tools are registered on the think() call this phase, so
// stop_reason should always be 'end_turn' in practice — but the tool_use branch
// exists now, deliberately not implemented, so Phase 2 has a clear, obvious
// place to add real execution rather than restructuring the loop later.

export const act = async (thinkResult: ThinkResult): Promise<ActResult> => {
  const { state, responseText, stopReason } = thinkResult
  const start = Date.now()

  emit({
    source: 'agents', type: 'act.start', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: 0,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
  })

  const updatedMessages = [...state.messages, { role: 'assistant' as const, content: responseText }]

  if (stopReason === 'tool_use') {
    // Deliberately not implemented — Phase 2 (Multi-Tool Orchestrator) wires
    // real tool execution here. Emitting act.failed rather than silently
    // no-op'ing, so this gap is visible in the event stream if it's ever hit.
    emit({
      source: 'agents', type: 'act.failed', traceId: state.traceId ?? '',
      timestamp: new Date().toISOString(), durationMs: Date.now() - start,
      env: getEnv(), domain: state.domain, iteration: state.iteration,
      reason: 'tool_use requested but no tools are registered this phase (Phase 2 scope)',
    })
    return { state: { ...state, messages: updatedMessages }, toolExecuted: false }
  }

  emit({
    source: 'agents', type: 'act.complete', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: Date.now() - start,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
  })

  return { state: { ...state, messages: updatedMessages }, toolExecuted: false }
}
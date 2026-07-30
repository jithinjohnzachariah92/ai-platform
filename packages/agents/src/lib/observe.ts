import { emit } from '@jz92/ai-core'
import type { AIEnvironment } from '@jz92/ai-core'
import type { AgentState, ObserveResult } from './types.js'

// ── observe ────────────────────────────────────────────────────────────────────
// The perception step of the ReAct loop. Gathers the current state (task +
// message history) and formats it into the context the "think" step reasons
// over. On the first iteration this is just the task; on later iterations it
// includes whatever "act" produced last time around.

const getEnv = (): AIEnvironment => (process.env.NODE_ENV as AIEnvironment) ?? 'development'

export const observe = (state: AgentState): ObserveResult => {
  const start = Date.now()

  emit({
    source: 'agents', type: 'observe.start', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: 0,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
  })

  const context = state.messages.length === 0
    ? `Task: ${state.task}`
    : state.messages.map((m) => `${m.role}: ${m.content}`).join('\n')

  emit({
    source: 'agents', type: 'observe.complete', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: Date.now() - start,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
  })

  return { state, context }
}
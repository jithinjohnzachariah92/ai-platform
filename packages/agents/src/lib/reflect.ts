import { emit } from '@jz92/ai-core'
import type { AIEnvironment } from '@jz92/ai-core'
import type { AgentState } from './types.js'
import type { ActResult } from './act.js'

const getEnv = (): AIEnvironment => (process.env.NODE_ENV as AIEnvironment) ?? 'development'

const COMPLETION_MARKER = 'TASK COMPLETE:'

export type ReflectResult = {
  state: AgentState
  isDone: boolean
  finalAnswer?: string   // only set when isDone is true
}

// ── reflect ────────────────────────────────────────────────────────────────────
// Looks at what act() just produced and decides whether the loop is genuinely
// finished (the model signalled completion via the sentinel think() asks for)
// or whether another observe -> think -> act cycle is needed.

export const reflect = (actResult: ActResult): ReflectResult => {
  const { state } = actResult
  const start = Date.now()

  emit({
    source: 'agents', type: 'reflect.start', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: 0,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
  })

  const lastMessage = state.messages[state.messages.length - 1]
  const markerIndex = lastMessage?.content.indexOf(COMPLETION_MARKER) ?? -1
  const isDone = markerIndex !== -1

  const finalAnswer = isDone
    ? lastMessage.content.slice(markerIndex + COMPLETION_MARKER.length).trim()
    : undefined

  emit({
    source: 'agents', type: 'reflect.complete', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: Date.now() - start,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
    step: isDone ? 'task complete' : 'continuing to next iteration',
  })

  return { state, isDone, finalAnswer }
}
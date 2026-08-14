import { emit } from '@jz92/ai-core'
import type { AIEnvironment } from '@jz92/ai-core'
import type { ToolRegistry } from '@jz92/tools'
import type { AgentState } from './types.js'
import type { ThinkResult } from './think.js'

const getEnv = (): AIEnvironment => (process.env.NODE_ENV as AIEnvironment) ?? 'development'

export type ActResult = {
  state: AgentState
  toolExecuted: boolean
}

export const act = async (
  thinkResult: ThinkResult,
  registry?: ToolRegistry
): Promise<ActResult> => {
  const { state, responseText, stopReason, promptedMessage, toolUse } = thinkResult
  const start = Date.now()

  emit({
    source: 'agents', type: 'act.start', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: 0,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
  })

  if (stopReason === 'tool_use' && toolUse && registry) {
    const result = await registry.call(toolUse.name, toolUse.input, { traceId: state.traceId })

    const toolResultContent = result.success
      ? JSON.stringify(result.data)
      : `Tool call failed: ${result.reason}`

    const updatedMessages = [
      ...state.messages,
      promptedMessage,
      { role: 'assistant' as const, content: responseText || `[calling ${toolUse.name}]` },
      { role: 'tool' as const, content: toolResultContent },
    ]

    emit({
      source: 'agents', type: 'act.complete', traceId: state.traceId ?? '',
      timestamp: new Date().toISOString(), durationMs: Date.now() - start,
      env: getEnv(), domain: state.domain, iteration: state.iteration,
      step: `called ${toolUse.name}`,
    })

    return { state: { ...state, messages: updatedMessages }, toolExecuted: true }
  }

  const updatedMessages = [
    ...state.messages,
    promptedMessage,
    { role: 'assistant' as const, content: responseText },
  ]

  if (stopReason === 'tool_use') {
    emit({
      source: 'agents', type: 'act.failed', traceId: state.traceId ?? '',
      timestamp: new Date().toISOString(), durationMs: Date.now() - start,
      env: getEnv(), domain: state.domain, iteration: state.iteration,
      reason: 'tool_use requested but no registry was provided to act()',
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
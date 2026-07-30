import Anthropic from '@anthropic-ai/sdk'
import { emit } from '@jz92/ai-core'
import type { AIEnvironment } from '@jz92/ai-core'
import type { AgentState } from './types.js'

const getEnv = (): AIEnvironment => (process.env.NODE_ENV as AIEnvironment) ?? 'development'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type ThinkResult = {
  state: AgentState
  responseText: string
  stopReason: string | null   // raw Anthropic stop_reason — 'end_turn' | 'tool_use' | etc.
                                // No tools registered this phase, so expect 'end_turn'
                                // almost always; act.ts branches on this value regardless,
                                // ready for Phase 2 to register real tools against it.
}

const SYSTEM_PROMPT = `You are an agent working through a task step by step.
Think through what to do next, then either continue reasoning or, if the
task is fully resolved, clearly state "TASK COMPLETE:" followed by your
final answer.`

export const think = async (state: AgentState, context: string): Promise<ThinkResult> => {
  const start = Date.now()

  emit({
    source: 'agents', type: 'think.start', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: 0,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
  })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: context }],
  })

  const responseText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { text: string }).text)
    .join('\n')

  emit({
    source: 'agents', type: 'think.complete', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: Date.now() - start,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
    step: responseText.slice(0, 100),   // short preview for the event log
  })

  return { state, responseText, stopReason: response.stop_reason }
}
import Anthropic from '@anthropic-ai/sdk'
import { emit } from '@jz92/ai-core'
import type { AIEnvironment } from '@jz92/ai-core'
import type { AgentState, AgentMessage } from './types.js'
import type { AnthropicToolDef } from '@jz92/tools'

const getEnv = (): AIEnvironment => (process.env.NODE_ENV as AIEnvironment) ?? 'development'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type ThinkResult = {
  state: AgentState
  responseText: string
  stopReason: string | null
  promptedMessage: AgentMessage
  toolUse?: { name: string; input: unknown; id: string }   // present when Claude wants to call a tool
}

const SYSTEM_PROMPT = `You are an agent working through a task step by step across
multiple turns. Each turn, you'll be reminded to continue or conclude. Think
through what to do next, then either continue reasoning, call an available
tool if one is relevant, or — if the task is fully resolved — clearly state
"TASK COMPLETE:" followed by your final answer. Do not restart your reasoning
from scratch each turn — build on what you've already worked out.`

const CONTINUATION_PROMPT = `Continue working on this task, building on your
reasoning so far. If you have reached a final answer that satisfies every
constraint, respond with exactly "TASK COMPLETE:" followed by the complete
answer. Otherwise, continue toward a conclusion — do not restart from scratch.`

export const think = async (
  state: AgentState,
  tools?: AnthropicToolDef[]
): Promise<ThinkResult> => {
  const start = Date.now()

  emit({
    source: 'agents', type: 'think.start', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: 0,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
  })

  const promptedMessage: AgentMessage = state.messages.length === 0
    ? { role: 'user', content: `Task: ${state.task}` }
    : { role: 'user', content: CONTINUATION_PROMPT }

  const messages = [...state.messages, promptedMessage].map((m) => ({
    role: (m.role === 'tool' ? 'user' : m.role) as 'user' | 'assistant',
    content: m.content,
  }))

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages,
    tools: tools && tools.length > 0 ? tools : undefined,
  })

  const textBlocks = response.content.filter((b) => b.type === 'text')
  const responseText = textBlocks.map((b) => (b as { text: string }).text).join('\n')

  const toolUseBlock = response.content.find((b) => b.type === 'tool_use') as
    | { type: 'tool_use'; id: string; name: string; input: unknown }
    | undefined

  emit({
    source: 'agents', type: 'think.complete', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: Date.now() - start,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
    step: (responseText || `tool_use: ${toolUseBlock?.name}`).slice(0, 100),
  })

  return {
    state, responseText, stopReason: response.stop_reason, promptedMessage,
    toolUse: toolUseBlock ? { name: toolUseBlock.name, input: toolUseBlock.input, id: toolUseBlock.id } : undefined,
  }
}
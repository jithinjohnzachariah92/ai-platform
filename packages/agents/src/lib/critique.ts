import Anthropic from '@anthropic-ai/sdk'
import { emit } from '@jz92/ai-core'
import type { AIEnvironment } from '@jz92/ai-core'
import type { AgentState } from './types.js'

const getEnv = (): AIEnvironment => (process.env.NODE_ENV as AIEnvironment) ?? 'development'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type CritiqueResult = {
  finalAnswer: string
  wasRevised: boolean
}

const CRITIQUE_SYSTEM_PROMPT = `You are reviewing an agent's proposed final answer against
its original task, purely for quality. Be genuinely critical — look for gaps, unstated
assumptions, or places the answer doesn't actually satisfy the task.

If the answer is genuinely good as-is, respond with exactly: APPROVED

If it has a real, fixable gap, respond with: REVISED: <the corrected, complete answer>

Do not revise for style alone — only revise if the original answer would mislead
or fail to satisfy the task as stated.`

// ── critique ───────────────────────────────────────────────────────────────────
// A second model call, deliberately separate from think(), reviewing the
// proposed final answer with fresh eyes against the original task. This is
// what makes self-critique a real mechanism rather than a no-op pass —
// it can and does change the output when the review finds a genuine gap.

export const critique = async (
  state: AgentState,
  proposedAnswer: string
): Promise<CritiqueResult> => {
  const start = Date.now()

  emit({
    source: 'agents', type: 'critique.start', traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: 0,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
  })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: CRITIQUE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Original task: ${state.task}\n\nProposed final answer: ${proposedAnswer}`,
    }],
  })

  const responseText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { text: string }).text)
    .join('\n')
    .trim()

  const revisedMarkerIndex = responseText.indexOf('REVISED:')
  const wasRevised = revisedMarkerIndex !== -1
  const finalAnswer = wasRevised
    ? responseText.slice(revisedMarkerIndex + 'REVISED:'.length).trim()
    : proposedAnswer

  emit({
    source: 'agents',
    type: wasRevised ? 'critique.revised' : 'critique.complete',
    traceId: state.traceId ?? '',
    timestamp: new Date().toISOString(), durationMs: Date.now() - start,
    env: getEnv(), domain: state.domain, iteration: state.iteration,
    reason: wasRevised ? 'critique found a genuine gap and revised the answer' : undefined,
  })

  return { finalAnswer, wasRevised }
}
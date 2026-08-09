import { emit } from '@jz92/ai-core'
import type { AIEnvironment } from '@jz92/ai-core'
import type { RegisteredTool } from './types.js'

const getEnv = (): AIEnvironment => (process.env.NODE_ENV as AIEnvironment) ?? 'development'

export type CallToolResult =
  | { success: true; data: unknown }
  | { success: false; reason: string }

// ── callTool ───────────────────────────────────────────────────────────────────
// The actual execution path: validate input against the tool's schema, run the
// handler, validate output against the tool's schema, emit proper events at
// every stage. This is what makes the registry trustworthy — a tool can never
// silently receive malformed input or return malformed output without it being
// caught and surfaced, not passed through.

export const callTool = async (
  tool: RegisteredTool,
  rawInput: unknown,
  context?: { traceId?: string }
): Promise<CallToolResult> => {
  const { capability, handler } = tool
  const traceId = context?.traceId ?? ''
  const start = Date.now()

  emit({
    source: 'tools', type: 'call.start', traceId,
    timestamp: new Date().toISOString(), durationMs: 0,
    env: getEnv(), toolName: capability.name, domain: capability.domain,
    invocationKind: capability.invocationKind,
  })

  const inputResult = capability.inputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    const reason = `input validation failed: ${inputResult.error.message}`
    emit({
      source: 'tools', type: 'call.input_invalid', traceId,
      timestamp: new Date().toISOString(), durationMs: Date.now() - start,
      env: getEnv(), toolName: capability.name, domain: capability.domain,
      invocationKind: capability.invocationKind, reason,
    })
    return { success: false, reason }
  }

  let rawOutput: unknown
  try {
    rawOutput = await handler(inputResult.data)
  } catch (err) {
    const reason = `handler threw: ${String(err)}`
    emit({
      source: 'tools', type: 'call.failure', traceId,
      timestamp: new Date().toISOString(), durationMs: Date.now() - start,
      env: getEnv(), toolName: capability.name, domain: capability.domain,
      invocationKind: capability.invocationKind, reason,
    })
    return { success: false, reason }
  }

  const outputResult = capability.outputSchema.safeParse(rawOutput)
  if (!outputResult.success) {
    // A tool that returns malformed output is a real bug — surfaced here
    // rather than passed through, same principle as the empty-filter
    // collapse we chased down in NL2Mongo: never trust unvalidated shape.
    const reason = `output validation failed: ${outputResult.error.message}`
    emit({
      source: 'tools', type: 'call.output_invalid', traceId,
      timestamp: new Date().toISOString(), durationMs: Date.now() - start,
      env: getEnv(), toolName: capability.name, domain: capability.domain,
      invocationKind: capability.invocationKind, reason,
    })
    return { success: false, reason }
  }

  emit({
    source: 'tools', type: 'call.success', traceId,
    timestamp: new Date().toISOString(), durationMs: Date.now() - start,
    env: getEnv(), toolName: capability.name, domain: capability.domain,
    invocationKind: capability.invocationKind,
  })

  return { success: true, data: outputResult.data }
}
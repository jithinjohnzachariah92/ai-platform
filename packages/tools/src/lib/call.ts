import { emit } from '@jz92/ai-core'
import type { AIEnvironment } from '@jz92/ai-core'
import type { RegisteredTool } from './types.js'

const getEnv = (): AIEnvironment => (process.env.NODE_ENV as AIEnvironment) ?? 'development'

export type CallToolResult =
  | { success: true; data: unknown }
  | { success: false; reason: string }

export const callTool = async (
  tool: RegisteredTool,
  rawInput: unknown,
  context?: { traceId?: string; grantedPermissions?: string[] }
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

  // ── Permission scoping ──────────────────────────────────────────────────────
  // A tool with no requiredPermissions declared is open to any caller — no
  // change from before. A tool that declares required permissions rejects
  // any caller missing even one of them, checked BEFORE input validation —
  // no reason to validate input for a call that's going to be denied anyway.
  const required = capability.requiredPermissions ?? []
  if (required.length > 0) {
    const granted = new Set(context?.grantedPermissions ?? [])
    const missing = required.filter((p) => !granted.has(p))

    if (missing.length > 0) {
      const reason = `missing required permission(s): ${missing.join(', ')}`
      emit({
        source: 'tools', type: 'call.permission_denied', traceId,
        timestamp: new Date().toISOString(), durationMs: Date.now() - start,
        env: getEnv(), toolName: capability.name, domain: capability.domain,
        invocationKind: capability.invocationKind, reason,
      })
      return { success: false, reason }
    }
  }

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
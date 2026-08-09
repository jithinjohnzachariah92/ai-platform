import type { RegisteredTool, ToolCapability } from './types.js'
import { callTool, type CallToolResult } from './call.js'

export type ToolRegistry = {
  register: (tool: RegisteredTool) => void
  get: (name: string) => RegisteredTool | undefined
  list: () => ToolCapability[]
  call: (name: string, input: unknown, context?: { traceId?: string }) => Promise<CallToolResult>
}

export const createToolRegistry = (): ToolRegistry => {
  const tools = new Map<string, RegisteredTool>()

  return {
    register: (tool) => {
      if (tools.has(tool.capability.name)) {
        throw new Error(`[tools] A tool named "${tool.capability.name}" is already registered`)
      }
      tools.set(tool.capability.name, tool)
    },

    get: (name) => tools.get(name),

    list: () => Array.from(tools.values()).map((t) => t.capability),

    call: async (name, input, context) => {
      const tool = tools.get(name)
      if (!tool) {
        return { success: false, reason: `no tool registered under the name "${name}"` }
      }
      return callTool(tool, input, context)
    },
  }
}
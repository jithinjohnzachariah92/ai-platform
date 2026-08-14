import { z } from 'zod'
import type { ToolCapability } from './types.js'

export type AnthropicToolDef = {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
    [key: string]: unknown
  }
}

export const toAnthropicToolDefs = (capabilities: ToolCapability[]): AnthropicToolDef[] => {
  return capabilities.map((cap) => {
    const schema = z.toJSONSchema(cap.inputSchema) as Record<string, unknown>
    return {
      name: cap.name,
      description: cap.description,
      input_schema: {
        ...schema,
        type: 'object' as const,   // spread first, force the literal after —
                                     // guarantees this at the type level even
                                     // though z.toJSONSchema already produces
                                     // it correctly at runtime for object schemas
      },
    }
  })
}
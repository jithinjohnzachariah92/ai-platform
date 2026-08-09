export { createToolRegistry } from './lib/registry.js'
export { callTool } from './lib/call.js'
export type { ToolRegistry } from './lib/registry.js'
export type { CallToolResult } from './lib/call.js'
export type {
  ToolCapability,
  ToolHandler,
  RegisteredTool,
  ToolInvocationKind,
} from './lib/types.js'
export { connectMcpServer } from './lib/mcpAdapter.js'
export type { McpAdapterConfig } from './lib/mcpAdapter.js'
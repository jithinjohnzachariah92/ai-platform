import type { ZodTypeAny } from 'zod'

// ── Invocation kind ────────────────────────────────────────────────────────────
// Distinguishes HOW a tool is actually called — matters for the MCP adapter
// (ticket 3) and for the capability-based routing logic (ticket 5), since an
// 'mcp' tool goes through a different call path than a plain in-process function.

export type ToolInvocationKind = 'function' | 'mcp' | 'api' | 'cli'

// ── ToolCapability ─────────────────────────────────────────────────────────────
// The metadata half of a tool — everything the agent's think() step needs to
// decide WHETHER and WHY to call this tool, without needing to know HOW it's
// implemented underneath.

export type ToolCapability = {
  name: string                        // unique across the registry, e.g. 'nl2mongo-query'
  description: string                 // natural-language description the model reads
                                        // to decide when this tool is relevant
  domain: string                       // which domain owns this tool — same reasoning
                                        // as RetrievalEvent's domain field: multiple
                                        // domains will eventually register tools here
  invocationKind: ToolInvocationKind
  inputSchema: ZodTypeAny
  outputSchema: ZodTypeAny
  requiredPermissions?: string[]       // populated properly in ticket 6 (permission scoping);
                                        // present now so the shape doesn't need to change later
}

// ── ToolHandler ────────────────────────────────────────────────────────────────
// The actual implementation half — deliberately generic (unknown in/out) so the
// registry itself never needs to know a specific tool's real types; validation
// against inputSchema/outputSchema happens in call() (ticket 2), not here.

export type ToolHandler = (input: unknown) => Promise<unknown>

export type RegisteredTool = {
  capability: ToolCapability
  handler: ToolHandler
}
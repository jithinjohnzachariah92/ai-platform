export type AgentRole = 'user' | 'assistant' | 'tool'

export type AgentMessage = {
  role: AgentRole
  content: string
}

// ── AgentState ─────────────────────────────────────────────────────────────────
// Threaded through every stage of the loop — each stage reads it, may update
// it, and passes it to the next stage. Kept as a plain object (not a class)
// so it's trivially serializable for logging/debugging.

export type AgentState = {
  domain: string             // which agent/task this belongs to, e.g. 'toy-task-demo'
  task: string               // the original task description, set once at loop start
  messages: AgentMessage[]   // full conversation history accumulated so far
  iteration: number          // current loop iteration, starts at 0
  maxIterations: number
  traceId?: string
}

export type ObserveResult = {
  state: AgentState
  context: string   // formatted context handed to the next (think) stage
}
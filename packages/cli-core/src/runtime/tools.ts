import type { Provider, ProviderToolSchema } from './provider'
import type { ToolLevel } from './permissions'

export interface TaskHandle {
  taskId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  prompt?: string
  output?: string
  createdAt: string
  completedAt?: string
}

export interface TaskStore {
  create(prompt: string): TaskHandle
  get(taskId: string): TaskHandle | undefined
  list(): TaskHandle[]
  update(taskId: string, patch: Partial<TaskHandle>): void
  cancel(taskId: string): void
}

export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

export interface SharedToolState {
  taskStore: TaskStore
  todos: TodoItem[]
  agentCounter: number
  planMode: boolean
}

export interface ToolContext {
  sessionId: string
  cwd: string
  /**
   * Current model identifier for the session. Tools that spawn nested provider
   * calls (e.g. `agent`) should default to this when no override is supplied.
   */
  model?: string
  sharedState?: SharedToolState
  askUser?: (prompt: string) => Promise<string>
  provider?: Provider
  tools?: ToolRegistry
}

export interface ToolResult {
  content: string
  isError: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  level: ToolLevel
  inputSchema: Record<string, unknown>
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>
}

export interface ToolRegistry {
  list(): ProviderToolSchema[]
  has(name: string): boolean
  execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult>
  register(tool: ToolDefinition): void
}

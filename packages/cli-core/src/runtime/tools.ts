import type { Provider, ProviderToolSchema } from './provider'
import type { ToolLevel } from './permissions'
import type { RuntimeBudget } from './budget'
import type { ToolArtifact, ToolEvidence } from './events'
import type { QuirkCounters } from './quirks'

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
  /**
   * sha256 of each file's full content as last read or written this session,
   * keyed by absolute path. edit_file checks against it so an edit planned
   * from a stale read (file changed underneath) is rejected instead of
   * silently applied to content the model never saw.
   */
  fileReadHashes?: Map<string, string>
}

export interface AskUserOption {
  readonly id?: string
  readonly label: string
  readonly description?: string
}

export interface AskUserRequest {
  readonly question: string
  readonly options?: readonly AskUserOption[]
  readonly multiSelect?: boolean
  readonly allowOther?: boolean
}

export type AskUserHandler = (request: string | AskUserRequest) => Promise<string>

export interface ToolContext {
  sessionId: string
  cwd: string
  /**
   * Read/search workspace roots for this session. `cwd` remains the primary
   * write root; tools such as read_file/glob_search/grep_search may allow
   * absolute paths under these additional roots.
   */
  workspaceRoots?: readonly string[]
  /**
   * Current model identifier for the session. Tools that spawn nested provider
   * calls (e.g. `agent`) should default to this when no override is supplied.
   */
  model?: string
  /**
   * Active permission mode for the session. Tools that gate behavior on the
   * mode (e.g. bash sandbox bypass on danger-full-access) read it from here.
   */
  permissionMode?: import('./permissions').PermissionMode
  sharedState?: SharedToolState
  askUser?: AskUserHandler
  provider?: Provider
  tools?: ToolRegistry
  /** Shared Orchentra spine prompt for nested model calls such as sub-agents. */
  spinePrompt?: string
  /**
   * Parent session's live budget. Tools that spawn nested provider calls
   * (e.g. `agent`) must check `budget.snapshot().exhausted` before starting
   * work and feed their own usage back via `budget.addUsage()` so nested
   * spend counts against the same dollar/step/token caps as the parent.
   */
  budget?: RuntimeBudget
  /**
   * Sub-agent nesting depth of this context. The root conversation runs at 0
   * (or undefined). Each sub-agent the `agent` tool spawns runs its own tool
   * calls at `depth + 1`, so the tool can enforce a recursion cap and bound
   * the nesting tree even though budget already bounds total spend.
   */
  subagentDepth?: number
  /**
   * Run-wide per-model deviation counters. The registry records malformed
   * args / unknown-tool calls here keyed by `model`; sub-agents inherit the
   * parent's instance so one run yields one set of counters.
   */
  quirks?: QuirkCounters
}

export interface ToolResult {
  /** Model-facing text — the only field that reaches the provider. */
  content: string
  isError: boolean
  /** Structured tool-specific payload for programmatic consumers (traces, gates, UIs). */
  data?: unknown
  /** Side effects: files/URLs the tool created, modified, or deleted. */
  artifacts?: ToolArtifact[]
  /** Machine-checkable proof of what the run did or found. */
  evidence?: ToolEvidence[]
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
  requirements?(): Readonly<Record<string, import('./permissions').PermissionMode>>
  has(name: string): boolean
  execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult>
  register(tool: ToolDefinition): void
}

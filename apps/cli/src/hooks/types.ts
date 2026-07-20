/**
 * Repo-local hooks system for the Orchentra CLI runtime.
 *
 * Operators describe hooks in `.orchentra/hooks.json`. Each entry binds a
 * shell command to a tool-use event (`pre_tool_use` or `post_tool_use`) and a
 * tool-name filter. When a tool call dispatches, every matching pre-hook fires
 * in declaration order; if any exits non-zero the call is blocked and the
 * stderr is surfaced. Post-hooks fire after the call returns; their stdout is
 * captured as an annotation but does not mutate the tool's actual result.
 *
 * The JSON shape sent to each hook on stdin is `HookExecutionContext` below.
 */

export type ToolHookEvent = 'pre_tool_use' | 'post_tool_use'

/**
 * Session/compaction/sub-agent lifecycle events. Unlike tool events these are
 * not tool-scoped and never block — they fire as notifications. Configured in
 * the same `.orchentra/hooks.json`, matched on `event` alone (their `tools`
 * field, if present, is ignored).
 */
export type LifecycleHookEvent =
  'session_start' | 'session_end' | 'pre_compact' | 'post_compact' | 'subagent_start' | 'subagent_stop'

export type HookEvent = ToolHookEvent | LifecycleHookEvent

/** JSON piped to a lifecycle hook's stdin: the event plus event-specific fields. */
export type LifecycleHookContext = { readonly event: LifecycleHookEvent } & Record<string, unknown>

/**
 * One entry in `.orchentra/hooks.json`. `tools` accepts exact tool names and
 * the wildcard `*`. `command` is executed via `child_process.spawn` with the
 * default shell — i.e. it may contain a shell string or an absolute path.
 */
export interface HookMatch {
  readonly event: HookEvent
  /** Tool-name filter for tool events (exact names or `*`). Ignored — and
   * defaulted to `[]` — for lifecycle events, which match on `event` alone. */
  readonly tools: readonly string[]
  readonly command: string
}

export interface HookConfig {
  readonly version: 1
  readonly hooks: readonly HookMatch[]
}

/**
 * JSON document piped to a hook's stdin. `result` is populated on
 * post_tool_use when the call succeeded; `error` is populated on
 * post_tool_use when the call failed. Both are absent for pre_tool_use.
 */
export interface HookExecutionContext {
  readonly event: HookEvent
  readonly tool: string
  readonly args: unknown
  readonly result?: string
  readonly error?: string
}

/**
 * Raw outcome of spawning a single hook command. `durationMs` is wall-clock
 * elapsed time for the spawn; useful when surfacing slow hooks to the user.
 */
export interface HookResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly durationMs: number
}

/**
 * Returned by the public `firePreToolUse` / `firePostToolUse` API. A blocked
 * pre-hook surfaces `blockedReason` to the caller; the tool MUST NOT execute.
 * `annotations` is the trimmed stdout of every hook that ran (in order) and
 * is purely informational — it never alters the underlying tool result.
 */
export interface HookFireResult {
  readonly blocked: boolean
  readonly blockedReason?: string
  readonly annotations?: readonly string[]
}

/**
 * Live progress for a single hook invocation. `running` fires before the hook
 * spawns; `done` fires once it exits, with `ok` reflecting a zero exit code.
 * The shared `id` lets the UI update the same row in place.
 */
export interface HookProgressUpdate {
  readonly id: string
  readonly phase: 'running' | 'done'
  readonly ok?: boolean
  // Only tool hooks surface a "running hook…" row; lifecycle hooks are silent
  // background notifications, so this stays the tool-event union.
  readonly event: ToolHookEvent
  readonly tool: string
  readonly command: string
}

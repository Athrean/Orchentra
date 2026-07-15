import type { ContextBreakdown } from './context-breakdown'
import type { UsageTotals } from './events'
import type { PermissionMode } from './permissions'
import type { EffortTier } from './provider'
import type { TerseMode } from './terse'
import type { PlanLevel } from './plan-level'
import type { SpineBudgetControls } from './spine'
import type { SpineSavings, TerseModeUsage } from './usage'
import type { ContextFile } from './context-files'
import type { PolicyRule } from '../permissions/policy'
import type { StoredPermissionRule } from '../permissions/store'

export interface ContextStats {
  readonly messages: number
  readonly estimatedTokens: number
  readonly contextWindowTokens?: number
  readonly compactThresholdRatio?: number
}

export interface SessionGoal {
  readonly objective: string
  readonly createdAt: string
}

export interface SessionTaskSummary {
  readonly id: string
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  readonly prompt?: string
  readonly output?: string
  readonly createdAt: string
  readonly completedAt?: string
}

export interface UndoFileEditResult {
  readonly path: string
  readonly action: 'restored' | 'deleted'
}

export type UndoFileEditsResult =
  | { readonly kind: 'empty' }
  | { readonly kind: 'applied'; readonly files: readonly UndoFileEditResult[] }
  | { readonly kind: 'error'; readonly message: string; readonly files: readonly UndoFileEditResult[] }

export type RewindResult =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'applied'
      /** User-turns removed from the model context. */
      readonly turnsDropped: number
      /** Messages removed from the model context. */
      readonly messagesDropped: number
      /** File edits reverted from the most recent rewound turn (best-effort). */
      readonly filesReverted: number
      /** Present when reverting the last turn's files failed. */
      readonly fileError?: string
    }

export interface RewindFilePreview {
  readonly path: string
  /** `restore` rewrites the pre-turn content; `delete` removes a file the turn created. */
  readonly action: 'restore' | 'delete'
  /** Lines the revert would add back (vs the current on-disk content). */
  readonly linesAdded: number
  /** Lines the revert would strip from the current on-disk content. */
  readonly linesRemoved: number
}

export type RewindPreview =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'preview'
      /** User-turns a subsequent rewind would drop. */
      readonly turnsToDrop: number
      /** Messages a subsequent rewind would drop. */
      readonly messagesToDrop: number
      /** File edits the revert would touch, with per-file line churn. */
      readonly files: readonly RewindFilePreview[]
    }

export interface SessionResumeResult {
  readonly sessionId: string
  readonly path: string
  readonly cwd: string
  readonly model: string
  readonly events: number
  readonly messages: number
  readonly toolCalls: number
  readonly contextComplete: boolean
}

export interface SessionForkResult {
  readonly sessionId: string
  readonly path: string
  readonly sourceSessionId: string
  readonly sourcePath: string
}

export interface SessionControl {
  getModel(): string
  /**
   * Switch the active model. Implementations should resolve aliases and
   * re-select the provider for the resolved model. Returns the fully resolved
   * model identifier.
   */
  setModel(model: string): string
  getPermissionMode(): PermissionMode
  /** Switch the active permission mode for the session. Returns the new mode. */
  setPermissionMode(mode: PermissionMode): PermissionMode
  getSessionId(): string
  getCwd?(): string
  setCwd?(cwd: string): string
  /** Primary cwd plus any extra read/search roots added for this REPL session. */
  getWorkspaceRoots?(): readonly string[]
  /** Add an extra read/search root for tools such as read_file, glob_search, and grep_search. */
  addWorkspaceRoot?(path: string): readonly string[]
  getTurns(): number
  getUsage(): UsageTotals
  /** Estimated live conversation footprint before provider-side caching. */
  getContextStats?(): ContextStats
  /** Distinct files pulled into context via read_file, for /context transparency. */
  listContextFiles?(): readonly ContextFile[]
  /**
   * Per-source accounting for `/context`: which tool schemas and repeated file
   * reads are eating the window, beyond the aggregate `getContextStats` total.
   */
  getContextBreakdown?(): ContextBreakdown
  /** Current session goal, when one has been set with /goal. */
  getGoal?(): SessionGoal | null
  setGoal?(objective: string): SessionGoal
  clearGoal?(): void
  /** Background agent task summaries available to /tasks. */
  listTaskSummaries?(): readonly SessionTaskSummary[]
  cancelTask?(id: string): boolean
  /** Revert successful write/edit_file effects from the most recent agent turn. */
  undoLastFileEdits?(): Promise<UndoFileEditsResult>
  /** Roll the model context back `turns` user-turns and revert the most recent
   * turn's file edits (best-effort). Distinct from undoLastFileEdits, which
   * only touches files. */
  rewindTurns?(turns: number): Promise<RewindResult>
  /** Dry-run a rewind: report the turns/messages and file edits a subsequent
   * rewindTurns(turns) would touch, without mutating anything. Powers the
   * look-before-you-leap preview gate in /rewind. */
  previewRewindTurns?(turns: number): Promise<RewindPreview>
  /** Output tokens + turns spent under each terse mode this session. */
  getTerseBreakdown?(): readonly TerseModeUsage[]
  /** Measured compaction + tool-output-trim savings, when the session tracks them. */
  getSavings?(): SpineSavings
  /** Live context/cost/tool-output controls that make up the context budget spine. */
  getBudgetControls?(): SpineBudgetControls
  /** Replace live context/cost/tool-output controls for subsequent turns. */
  setBudgetControls?(controls: Partial<SpineBudgetControls>): SpineBudgetControls
  /** Configured dollar budget caps, when the session exposes them. */
  getCostLimits?(): { maxCostUsd?: number; warnCostUsd?: number }
  /** Resolved declarative allow/deny/ask rules, when the session exposes them. */
  listPermissionRules?(): readonly PolicyRule[]
  /** Remembered interactive allow/deny rules, when the session exposes them. */
  listStoredPermissionRules?(): readonly StoredPermissionRule[]
  getEffort?(): EffortTier
  setEffort?(effort: EffortTier): EffortTier
  getTerseMode?(): TerseMode
  setTerseMode?(mode: TerseMode): TerseMode
  getPlanLevel?(): PlanLevel
  setPlanLevel?(level: PlanLevel): PlanLevel
  getPlanMode?(): boolean
  setPlanMode?(enabled: boolean): boolean
  clearHistory(): void
  /**
   * Start a fresh conversation/session while preserving the previous session
   * file on disk. Implementations without session persistence may omit this
   * and rely on clearHistory().
   */
  startNewSession?(): Promise<void>
  /**
   * Switch this REPL to an existing JSONL session file and hydrate whatever
   * provider context can be reconstructed from persisted events.
   */
  resumeSession?(path: string): Promise<SessionResumeResult>
  /** Continue a persisted autonomous RunState after a successful resumeSession. */
  resumeAutonomousRun?(): Promise<{ readonly ok: boolean; readonly reason: import('./events').DoneReason } | null>
  /** Clone the active session file and switch future writes to the cloned session. */
  forkSession?(): Promise<SessionForkResult>
  forceCompact(): void
}

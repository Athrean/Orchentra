import type { UsageTotals } from './events'
import type { PermissionMode } from './permissions'
import type { EffortTier } from './provider'
import type { TerseMode } from './terse'
import type { PlanLevel } from './plan-level'
import type { SpineBudgetControls } from './spine'
import type { SpineSavings, TerseModeUsage } from './usage'
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
  getTurns(): number
  getUsage(): UsageTotals
  /** Estimated live conversation footprint before provider-side caching. */
  getContextStats?(): ContextStats
  /** Current session goal, when one has been set with /goal. */
  getGoal?(): SessionGoal | null
  setGoal?(objective: string): SessionGoal
  clearGoal?(): void
  /** Background agent task summaries available to /tasks. */
  listTaskSummaries?(): readonly SessionTaskSummary[]
  cancelTask?(id: string): boolean
  /** Revert successful write/edit_file effects from the most recent agent turn. */
  undoLastFileEdits?(): Promise<UndoFileEditsResult>
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
  forceCompact(): void
}

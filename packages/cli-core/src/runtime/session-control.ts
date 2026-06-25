import type { UsageTotals } from './events'
import type { PermissionMode } from './permissions'
import type { EffortTier } from './provider'
import type { TerseMode } from './terse'
import type { TerseModeUsage } from './usage'
import type { PolicyRule } from '../permissions/policy'
import type { StoredPermissionRule } from '../permissions/store'

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
  getTurns(): number
  getUsage(): UsageTotals
  /** Output tokens + turns spent under each terse mode this session. */
  getTerseBreakdown?(): readonly TerseModeUsage[]
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
  getPlanMode?(): boolean
  setPlanMode?(enabled: boolean): boolean
  clearHistory(): void
  forceCompact(): void
}

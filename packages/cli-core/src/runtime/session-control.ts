import type { UsageTotals } from './events'
import type { PermissionMode } from './permissions'

export interface SessionControl {
  getModel(): string
  /**
   * Switch the active model. Implementations should resolve aliases and
   * re-select the provider for the resolved model. Returns the fully resolved
   * model identifier.
   */
  setModel(model: string): string
  getPermissionMode(): PermissionMode
  getSessionId(): string
  getTurns(): number
  getUsage(): UsageTotals
  clearHistory(): void
  forceCompact(): void
}

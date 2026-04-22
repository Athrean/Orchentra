import type { UsageTotals } from './events'
import type { PermissionMode } from './permissions'

export interface SessionControl {
  getModel(): string
  setModel(model: string): void
  getPermissionMode(): PermissionMode
  getSessionId(): string
  getTurns(): number
  getUsage(): UsageTotals
  clearHistory(): void
  forceCompact(): void
}

import type { PermissionRuleConfig } from '../permissions'

export interface TranslateAllowedToolsResult {
  config: PermissionRuleConfig
  warnings: string[]
}

export function translateAllowedTools(allowedTools: readonly string[]): TranslateAllowedToolsResult {
  const allow: string[] = []
  const warnings: string[] = []

  for (const entry of allowedTools) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      warnings.push(`skipped empty allowed-tools entry`)
      continue
    }
    allow.push(entry.trim())
  }

  return { config: { allow, deny: [], ask: [] }, warnings }
}

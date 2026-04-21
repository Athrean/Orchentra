export type ConfigSource = 'user' | 'project' | 'local'

export interface ConfigEntry {
  source: ConfigSource
  path: string
}

export interface RuntimeHookConfig {
  preToolUse: string[]
  postToolUse: string[]
  postToolUseFailure: string[]
}

export interface RuntimePermissionRuleConfig {
  allow: string[]
  deny: string[]
  ask: string[]
}

export interface RuntimeFeatureConfig {
  hooks: RuntimeHookConfig
  model: string | undefined
  aliases: Record<string, string>
  permissionMode: ResolvedPermissionMode | undefined
  permissionRules: RuntimePermissionRuleConfig
}

export type ResolvedPermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export interface RuntimeConfig {
  merged: Record<string, unknown>
  loadedEntries: ConfigEntry[]
  featureConfig: RuntimeFeatureConfig
}

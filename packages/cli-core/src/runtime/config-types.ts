import type { EffortTier } from './provider'
import type { TerseMode } from './terse'
import type { ExecutionProfile } from './execution-profile'

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

export interface MemoryFeatureConfig {
  enabled: boolean
  embeddingModel: string
  embeddingBaseUrl: string | undefined
  embeddingApiKey: string | undefined
  similarityThreshold: number
  maxResults: number
}

export interface BudgetFeatureConfig {
  /** Hard-stop the agent loop once estimated spend reaches this many USD. */
  maxCostUsd: number | undefined
  /** Warn once when estimated spend reaches this many USD. */
  warnCostUsd: number | undefined
}

export interface SubagentsFeatureConfig {
  /** Max sub-agent nesting depth (root=0); undefined keeps the built-in default (2). */
  maxDepth: number | undefined
  /** Max sub-agents running at once from one fan-out; undefined keeps the built-in default (4). */
  maxConcurrent: number | undefined
}

export interface RlmFeatureConfig {
  /** Default-off streaming-time speculation for explicitly safe tool calls. */
  speculativeToolCalls: boolean
}

export interface RuntimeFeatureConfig {
  hooks: RuntimeHookConfig
  model: string | undefined
  aliases: Record<string, string>
  effort: EffortTier
  terseMode: TerseMode
  permissionMode: ResolvedPermissionMode | undefined
  permissionRules: RuntimePermissionRuleConfig
  memory: MemoryFeatureConfig
  budget: BudgetFeatureConfig
  subagents: SubagentsFeatureConfig
  rlm: RlmFeatureConfig
  /** Inference architecture. `direct` remains the default/control. */
  executionProfile: ExecutionProfile
}

export type ResolvedPermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export interface RuntimeConfig {
  merged: Record<string, unknown>
  loadedEntries: ConfigEntry[]
  featureConfig: RuntimeFeatureConfig
  /** Resolved schema version of the merged settings after migration. */
  configVersion: number
}

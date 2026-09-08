import { join, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
import type {
  BudgetFeatureConfig,
  ConfigEntry,
  MemoryFeatureConfig,
  RuntimeConfig,
  RuntimeFeatureConfig,
  RuntimeHookConfig,
  RuntimePermissionRuleConfig,
  ResolvedPermissionMode,
  SubagentsFeatureConfig,
} from './config-types'
import { isEffortTier } from './provider'
import { isTerseMode } from './terse'
import { isExecutionProfile } from './execution-profile'
import { runMigrations, type Migration } from './migrations'
import { userPaths } from '../platform/paths'

/** Current settings schema version. Bump when a settings shape changes and add
 * the matching `vN -> vN+1` transform to CONFIG_MIGRATIONS below. */
export const CURRENT_CONFIG_VERSION = 2

/** Ordered `vN -> vN+1` settings transforms, keyed by from-version. Empty today:
 * the shape is in place so the next settings change adds a migration step here
 * instead of a silent breaking change. */
const CONFIG_MIGRATIONS: Record<number, Migration> = {
  // v2 adds the optional executionProfile setting. Existing files retain the
  // direct-mode default; the migration only advances the explicit schema stamp.
  1: (value) => value,
}

export class ConfigLoader {
  constructor(
    private readonly cwd: string,
    private readonly configHome: string,
    private readonly legacyPaths?: string[],
  ) {}

  static defaultFor(cwd: string): ConfigLoader {
    return new ConfigLoader(cwd, defaultConfigHome(), [
      join(userPaths().home, '.orchentra.json'),
      join(userPaths().legacy, 'settings.json'),
    ])
  }

  discover(): ConfigEntry[] {
    const legacyPath =
      dirname(this.configHome) !== '.' ? join(dirname(this.configHome), '.orchentra.json') : '.orchentra.json'
    return [
      ...(this.legacyPaths ?? [legacyPath]).map((path) => ({ source: 'user' as const, path })),
      { source: 'user', path: join(this.configHome, 'settings.json') },
      { source: 'project', path: join(this.cwd, '.orchentra.json') },
      { source: 'project', path: join(this.cwd, '.orchentra', 'settings.json') },
      { source: 'local', path: join(this.cwd, '.orchentra', 'settings.local.json') },
    ]
  }

  load(): RuntimeConfig {
    let merged: Record<string, unknown> = {}
    const loadedEntries: ConfigEntry[] = []

    for (const entry of this.discover()) {
      const parsed = readOptionalJsonObject(entry.path)
      if (!parsed) continue
      merged = deepMerge(merged, parsed)
      loadedEntries.push(entry)
    }

    // Bring the merged settings up to the current schema version. A settings file
    // from a newer Orchentra than this build throws here rather than being read
    // under the wrong shape. Missing version = the original schema (v1).
    merged = runMigrations(merged, { current: CURRENT_CONFIG_VERSION, migrations: CONFIG_MIGRATIONS })

    const featureConfig = extractFeatureConfig(merged)
    return { merged, loadedEntries, featureConfig, configVersion: CURRENT_CONFIG_VERSION }
  }
}

export function defaultConfigHome(): string {
  return userPaths().config
}

function readOptionalJsonObject(path: string): Record<string, unknown> | null {
  try {
    const contents = readFileSync(path, 'utf-8')
    if (contents.trim().length === 0) return {}
    const parsed = JSON.parse(contents)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target }
  for (const key of Object.keys(source)) {
    const sv = source[key]
    const tv = result[key]
    if (isPlainObject(sv) && isPlainObject(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>)
    } else {
      result[key] = sv
    }
  }
  return result
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractFeatureConfig(merged: Record<string, unknown>): RuntimeFeatureConfig {
  return {
    hooks: extractHooks(merged),
    model: extractModel(merged),
    aliases: extractAliases(merged),
    effort: extractEffort(merged),
    terseMode: extractTerseMode(merged),
    permissionMode: extractPermissionMode(merged),
    permissionRules: extractPermissionRules(merged),
    memory: extractMemoryConfig(merged),
    budget: extractBudgetConfig(merged),
    subagents: extractSubagentsConfig(merged),
    rlm: extractRlmConfig(merged),
    executionProfile: extractExecutionProfile(merged),
    maxOutputTokens: extractMaxOutputTokens(merged),
  }
}

function extractMaxOutputTokens(merged: Record<string, unknown>): number | undefined {
  const raw = merged.maxOutputTokens
  if (raw === undefined) return undefined
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new Error(`invalid maxOutputTokens ${JSON.stringify(raw)}; expected a positive integer`)
  }
  return raw
}

function extractRlmConfig(merged: Record<string, unknown>): RuntimeFeatureConfig['rlm'] {
  const rlm = isPlainObject(merged.rlm) ? (merged.rlm as Record<string, unknown>) : {}
  return { speculativeToolCalls: rlm.speculativeToolCalls === true }
}

function extractExecutionProfile(merged: Record<string, unknown>): RuntimeFeatureConfig['executionProfile'] {
  if (merged.executionProfile === undefined) return 'direct'
  if (isExecutionProfile(merged.executionProfile)) return merged.executionProfile
  throw new Error(`invalid executionProfile ${JSON.stringify(merged.executionProfile)}; expected direct or rlm`)
}

function extractSubagentsConfig(merged: Record<string, unknown>): SubagentsFeatureConfig {
  const sub = isPlainObject(merged.subagents) ? (merged.subagents as Record<string, unknown>) : {}
  const positiveInt = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined
  return {
    maxDepth: positiveInt(sub.maxDepth),
    maxConcurrent: positiveInt(sub.maxConcurrent),
  }
}

function extractTerseMode(merged: Record<string, unknown>): RuntimeFeatureConfig['terseMode'] {
  return isTerseMode(merged.terseMode) ? merged.terseMode : 'off'
}

function extractBudgetConfig(merged: Record<string, unknown>): BudgetFeatureConfig {
  const budget = isPlainObject(merged.budget) ? (merged.budget as Record<string, unknown>) : {}
  const positive = (v: unknown): number | undefined => (typeof v === 'number' && v > 0 ? v : undefined)
  return {
    maxCostUsd: positive(budget.maxCostUsd),
    warnCostUsd: positive(budget.warnCostUsd),
  }
}

function extractEffort(merged: Record<string, unknown>): RuntimeFeatureConfig['effort'] {
  return isEffortTier(merged.effort) ? merged.effort : 'medium'
}

function extractMemoryConfig(merged: Record<string, unknown>): MemoryFeatureConfig {
  const mem = isPlainObject(merged.memory) ? (merged.memory as Record<string, unknown>) : {}
  const envApiKey = process.env.OPENAI_API_KEY
  return {
    enabled: typeof mem.enabled === 'boolean' ? mem.enabled : true,
    embeddingModel: typeof mem.embeddingModel === 'string' ? mem.embeddingModel : 'text-embedding-3-small',
    embeddingBaseUrl: typeof mem.embeddingBaseUrl === 'string' ? mem.embeddingBaseUrl : undefined,
    embeddingApiKey: typeof mem.embeddingApiKey === 'string' ? mem.embeddingApiKey : envApiKey,
    similarityThreshold: typeof mem.similarityThreshold === 'number' ? mem.similarityThreshold : 0.78,
    maxResults: typeof mem.maxResults === 'number' ? mem.maxResults : 3,
  }
}

function extractModel(merged: Record<string, unknown>): string | undefined {
  if (typeof merged.model === 'string') return merged.model
  return undefined
}

function extractAliases(merged: Record<string, unknown>): Record<string, string> {
  const raw = merged.aliases
  if (!isPlainObject(raw)) return {}
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') result[k] = v
  }
  return result
}

function extractHooks(merged: Record<string, unknown>): RuntimeHookConfig {
  const hooksVal = merged.hooks
  if (!isPlainObject(hooksVal)) return { preToolUse: [], postToolUse: [], postToolUseFailure: [] }

  return {
    preToolUse: toStringArray(hooksVal.PreToolUse),
    postToolUse: toStringArray(hooksVal.PostToolUse),
    postToolUseFailure: toStringArray(hooksVal.PostToolUseFailure),
  }
}

function extractPermissionMode(merged: Record<string, unknown>): ResolvedPermissionMode | undefined {
  const raw = merged.permissionMode
  if (typeof raw !== 'string') return undefined
  const valid: ResolvedPermissionMode[] = ['read-only', 'workspace-write', 'danger-full-access']
  return valid.includes(raw as ResolvedPermissionMode) ? (raw as ResolvedPermissionMode) : undefined
}

function extractPermissionRules(merged: Record<string, unknown>): RuntimePermissionRuleConfig {
  const perms = merged.permissions
  if (!isPlainObject(perms)) return { allow: [], deny: [], ask: [] }
  return {
    allow: toStringArray(perms.allow),
    deny: toStringArray(perms.deny),
    ask: toStringArray(perms.ask),
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

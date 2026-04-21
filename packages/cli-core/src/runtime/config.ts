import { join, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
import type {
  ConfigEntry,
  MemoryFeatureConfig,
  RuntimeConfig,
  RuntimeFeatureConfig,
  RuntimeHookConfig,
  RuntimePermissionRuleConfig,
  ResolvedPermissionMode,
} from './config-types'

export class ConfigLoader {
  constructor(
    private readonly cwd: string,
    private readonly configHome: string,
  ) {}

  static defaultFor(cwd: string): ConfigLoader {
    return new ConfigLoader(cwd, defaultConfigHome())
  }

  discover(): ConfigEntry[] {
    const legacyPath =
      dirname(this.configHome) !== '.' ? join(dirname(this.configHome), '.orchentra.json') : '.orchentra.json'
    return [
      { source: 'user', path: legacyPath },
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

    const featureConfig = extractFeatureConfig(merged)
    return { merged, loadedEntries, featureConfig }
  }
}

export function defaultConfigHome(): string {
  const env = process.env.ORCHESTRA_CONFIG_HOME
  if (env) return env
  const home = process.env.HOME
  if (home) return join(home, '.orchentra')
  return '.orchentra'
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
    permissionMode: extractPermissionMode(merged),
    permissionRules: extractPermissionRules(merged),
    memory: extractMemoryConfig(merged),
  }
}

function extractMemoryConfig(merged: Record<string, unknown>): MemoryFeatureConfig {
  const mem = isPlainObject(merged.memory) ? (merged.memory as Record<string, unknown>) : {}
  return {
    enabled: typeof mem.enabled === 'boolean' ? mem.enabled : true,
    embeddingModel: typeof mem.embeddingModel === 'string' ? mem.embeddingModel : 'text-embedding-3-small',
    embeddingBaseUrl: typeof mem.embeddingBaseUrl === 'string' ? mem.embeddingBaseUrl : undefined,
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

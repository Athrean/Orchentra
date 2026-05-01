import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type RuleDecision = 'allow' | 'deny'

export interface StoredPermissionRule {
  readonly tool: string
  readonly pattern: string
  readonly decision: RuleDecision
  readonly addedAt?: string
}

export type StoreVerdict = RuleDecision | 'unknown'

export interface PermissionStore {
  decide(toolName: string, input: unknown): StoreVerdict
  remember(rule: StoredPermissionRule): void
  list(): readonly StoredPermissionRule[]
}

export interface CreatePermissionStoreOptions {
  /** When set, rules persist to `<cwd>/.orchentra/permissions.json`. */
  readonly cwd?: string
  /** Override the time source (for tests). Default: `() => new Date().toISOString()`. */
  readonly now?: () => string
  /** Sink for non-fatal load warnings. Default: `console.warn`. */
  readonly onWarn?: (message: string) => void
}

const SCHEMA_VERSION = 1
const FILE_REL_PATH = ['.orchentra', 'permissions.json'] as const

export function createPermissionStore(opts: CreatePermissionStoreOptions = {}): PermissionStore {
  const now = opts.now ?? ((): string => new Date().toISOString())
  const onWarn = opts.onWarn ?? ((m: string): void => console.warn(m))
  const filePath = opts.cwd ? join(opts.cwd, ...FILE_REL_PATH) : null
  const rules: StoredPermissionRule[] = filePath ? loadRules(filePath, onWarn) : []

  function persist(): void {
    if (!filePath) return
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify({ version: SCHEMA_VERSION, rules }, null, 2) + '\n', 'utf8')
  }

  return {
    decide(toolName, input) {
      const flat = flatten(toolName, input)
      let allow = false
      for (const r of rules) {
        if (r.tool !== toolName) continue
        if (!matches(r.pattern, flat)) continue
        if (r.decision === 'deny') return 'deny'
        allow = true
      }
      return allow ? 'allow' : 'unknown'
    },
    remember(rule) {
      const dup = rules.find((r) => r.tool === rule.tool && r.pattern === rule.pattern && r.decision === rule.decision)
      if (dup) return
      rules.push({ ...rule, addedAt: rule.addedAt ?? now() })
      persist()
    },
    list() {
      return rules.slice()
    },
  }
}

function loadRules(path: string, onWarn: (m: string) => void): StoredPermissionRule[] {
  if (!existsSync(path)) return []
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    onWarn(`permission store: cannot read ${path}: ${(err as Error).message}`)
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    onWarn(`permission store: malformed JSON in ${path}: ${(err as Error).message}`)
    return []
  }
  if (!isRecord(parsed)) {
    onWarn(`permission store: expected object in ${path}`)
    return []
  }
  if (parsed.version !== SCHEMA_VERSION) {
    onWarn(
      `permission store: unsupported schema version ${String(parsed.version)} in ${path} (expected ${SCHEMA_VERSION})`,
    )
    return []
  }
  if (!Array.isArray(parsed.rules)) return []
  const out: StoredPermissionRule[] = []
  for (const item of parsed.rules) {
    if (!isRecord(item)) continue
    const tool = item.tool
    const pattern = item.pattern
    const decision = item.decision
    if (typeof tool !== 'string' || typeof pattern !== 'string') continue
    if (decision !== 'allow' && decision !== 'deny') continue
    out.push({
      tool,
      pattern,
      decision,
      addedAt: typeof item.addedAt === 'string' ? item.addedAt : undefined,
    })
  }
  return out
}

function flatten(toolName: string, input: unknown): string {
  if (toolName === 'bash' && input && typeof input === 'object' && 'command' in input) {
    const cmd = (input as { command: unknown }).command
    if (typeof cmd === 'string') return cmd
  }
  return JSON.stringify(input)
}

function matches(pattern: string, value: string): boolean {
  const re = new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + '$')
  return re.test(value)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object'
}

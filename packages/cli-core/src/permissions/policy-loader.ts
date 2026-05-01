import { existsSync, readFileSync, watch as fsWatch, type FSWatcher } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PolicyRule, Ruleset } from './policy'

const SCHEMA_VERSION = 1
const FILE_REL_PATH = ['.orchentra', 'permissions.json'] as const

export interface LoadPolicyOptions {
  /** Watch for file changes and emit 'change' events. Default: false. */
  readonly watch?: boolean
  /** Sink for non-fatal load warnings. Default: console.warn. */
  readonly onWarn?: (message: string) => void
}

type ChangeListener = (next: Ruleset) => void

export interface PolicyHandle {
  readonly ruleset: Ruleset
  on(event: 'change', cb: ChangeListener): void
  close(): void
}

const EMPTY: Ruleset = { version: SCHEMA_VERSION, rules: [] }

export function loadPolicy(cwd: string, opts: LoadPolicyOptions = {}): PolicyHandle {
  const onWarn = opts.onWarn ?? ((m: string): void => console.warn(m))
  const filePath = join(cwd, ...FILE_REL_PATH)
  let current: Ruleset = readRulesetOrEmpty(filePath, onWarn) ?? EMPTY
  const listeners: ChangeListener[] = []
  let watcher: FSWatcher | null = null
  let closed = false

  if (opts.watch) {
    try {
      watcher = fsWatch(dirname(filePath), { persistent: false }, (_event, name) => {
        if (closed) return
        if (name && name !== FILE_REL_PATH[1]) return
        const next = readRulesetOrEmpty(filePath, onWarn)
        if (next === null) return // keep last good on parse error
        current = next
        for (const cb of listeners) cb(current)
      })
    } catch (err) {
      onWarn(`policy loader: cannot watch ${dirname(filePath)}: ${(err as Error).message}`)
    }
  }

  return {
    get ruleset(): Ruleset {
      return current
    },
    on(_event, cb) {
      listeners.push(cb)
    },
    close() {
      closed = true
      watcher?.close()
      watcher = null
      listeners.length = 0
    },
  }
}

/**
 * Returns the parsed ruleset, or `null` if the file existed but parsed
 * invalid (so the caller can keep last-good). Returns EMPTY on missing
 * file (no warning fired — absence is the default state).
 */
function readRulesetOrEmpty(path: string, onWarn: (m: string) => void): Ruleset | null {
  if (!existsSync(path)) return EMPTY
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    onWarn(`policy loader: cannot read ${path}: ${(err as Error).message}`)
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    onWarn(`policy loader: malformed JSON in ${path}: ${(err as Error).message}`)
    return null
  }
  if (!isRecord(parsed)) {
    onWarn(`policy loader: expected object in ${path}`)
    return null
  }
  if (parsed.version !== SCHEMA_VERSION) {
    onWarn(
      `policy loader: unsupported schema version ${String(parsed.version)} in ${path} (expected ${SCHEMA_VERSION})`,
    )
    return null
  }
  if (!Array.isArray(parsed.rules)) return EMPTY
  const rules: PolicyRule[] = []
  for (const item of parsed.rules) {
    if (!isRecord(item)) continue
    const tool = item.tool
    const pattern = item.pattern
    const decision = item.decision
    if (typeof tool !== 'string' || typeof pattern !== 'string') continue
    if (decision !== 'allow' && decision !== 'deny') continue
    rules.push({ tool, pattern, decision })
  }
  return { version: SCHEMA_VERSION, rules }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object'
}

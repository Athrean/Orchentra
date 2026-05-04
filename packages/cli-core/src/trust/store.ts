import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type TrustStatus = 'trusted' | 'denied' | 'unknown'

export interface TrustStore {
  status(path: string): TrustStatus
  trust(path: string): void
  deny(path: string): void
  list(): { readonly trusted: readonly string[]; readonly denied: readonly string[] }
}

export interface CreateTrustStoreOptions {
  /** Persistence file. When omitted, store is in-memory only. */
  readonly filePath?: string
  /** Sink for non-fatal load warnings. Default: `console.warn`. */
  readonly onWarn?: (message: string) => void
}

const SCHEMA_VERSION = 1

interface State {
  trusted: string[]
  denied: string[]
}

export function createTrustStore(opts: CreateTrustStoreOptions = {}): TrustStore {
  const onWarn = opts.onWarn ?? ((m: string): void => console.warn(m))
  const filePath = opts.filePath
  const state: State = filePath ? load(filePath, onWarn) : { trusted: [], denied: [] }

  function persist(): void {
    if (!filePath) return
    mkdirSync(dirname(filePath), { recursive: true })
    const body = JSON.stringify({ version: SCHEMA_VERSION, trusted: state.trusted, denied: state.denied }, null, 2)
    writeFileSync(filePath, body + '\n', 'utf8')
  }

  return {
    status(path) {
      if (state.denied.includes(path)) return 'denied'
      if (state.trusted.includes(path)) return 'trusted'
      return 'unknown'
    },
    trust(path) {
      const dIdx = state.denied.indexOf(path)
      if (dIdx >= 0) state.denied.splice(dIdx, 1)
      if (!state.trusted.includes(path)) state.trusted.push(path)
      persist()
    },
    deny(path) {
      const tIdx = state.trusted.indexOf(path)
      if (tIdx >= 0) state.trusted.splice(tIdx, 1)
      if (!state.denied.includes(path)) state.denied.push(path)
      persist()
    },
    list() {
      return { trusted: state.trusted.slice(), denied: state.denied.slice() }
    },
  }
}

function load(path: string, onWarn: (m: string) => void): State {
  if (!existsSync(path)) return { trusted: [], denied: [] }
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    onWarn(`trust store: cannot read ${path}: ${(err as Error).message}`)
    return { trusted: [], denied: [] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    onWarn(`trust store: malformed JSON in ${path}: ${(err as Error).message}`)
    return { trusted: [], denied: [] }
  }
  if (!isRecord(parsed)) {
    onWarn(`trust store: expected object in ${path}`)
    return { trusted: [], denied: [] }
  }
  if (parsed.version !== SCHEMA_VERSION) {
    onWarn(`trust store: unsupported schema version ${String(parsed.version)} in ${path} (expected ${SCHEMA_VERSION})`)
    return { trusted: [], denied: [] }
  }
  return {
    trusted: stringsOnly(parsed.trusted),
    denied: stringsOnly(parsed.denied),
  }
}

function stringsOnly(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object'
}

export function defaultTrustStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ORCHENTRA_CONFIG_HOME
  if (override) return join(override, 'trusted-dirs')
  const home = env.HOME ?? ''
  return join(home, '.config', 'orchentra', 'trusted-dirs')
}

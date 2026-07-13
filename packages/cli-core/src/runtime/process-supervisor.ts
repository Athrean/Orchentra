import { randomUUID } from 'node:crypto'
import { connect } from 'node:net'

/**
 * ProcessSupervisor — run-scoped lifecycle for background processes (dev
 * servers first). Owned by the run's SharedToolState; torn down at run end so
 * no spawned server outlives the session. This is the M2 prerequisite: the
 * browser ops cannot navigate until a dev server can be started and reached.
 *
 * Background processes intentionally run outside the bash sandbox profile for
 * now (a dev server needs real network + filesystem); the honesty compromise is
 * that their env is scrubbed of credentials before launch (`sanitizeChildEnv`)
 * and the status is reported explicitly rather than pretending to be sandboxed.
 */

export type ProcessStatus = 'starting' | 'ready' | 'running' | 'exited' | 'failed'

export interface ReadinessSpec {
  /** Probe this URL until it responds (any HTTP status counts as up). */
  readonly url?: string
  /** Probe host:port via TCP connect until the socket opens. */
  readonly port?: number
  readonly host?: string
  /** Scrape the first matching URL from child stdout/stderr; becomes the probe target. */
  readonly urlFromLog?: RegExp
  /** Give up on readiness after this long; the handle stays startable, not killed. Default 15s. */
  readonly timeoutMs?: number
  /** Poll cadence. Default 250ms. */
  readonly intervalMs?: number
}

export interface ProcessSpec {
  /** Shell command line; run under `sh -c`. */
  readonly command: string
  readonly cwd: string
  /** Extra env layered onto the sanitized base env. */
  readonly env?: Record<string, string>
  readonly readiness?: ReadinessSpec
  readonly label?: string
}

export interface ManagedProcess {
  readonly id: string
  readonly label: string
  readonly command: string
  status: ProcessStatus
  pid?: number
  url?: string
  port?: number
  exitCode?: number
  error?: string
  readonly startedAt: string
  readyAt?: string
}

export interface SupervisedHandle {
  readonly pid?: number
  readonly exited: Promise<number>
  kill(): void
  readonly stdout?: ReadableStream<Uint8Array> | null
  readonly stderr?: ReadableStream<Uint8Array> | null
}

export interface SpawnRequest {
  readonly program: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Record<string, string>
}

export type ProcessSpawner = (req: SpawnRequest) => SupervisedHandle
export type ReadinessProbe = (target: { url?: string; host: string; port?: number }) => Promise<boolean>

export interface SupervisorOptions {
  readonly spawn?: ProcessSpawner
  readonly probe?: ReadinessProbe
  /** Base env before spec.env is layered and secrets scrubbed. Defaults to process.env. */
  readonly baseEnv?: Record<string, string | undefined>
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_INTERVAL_MS = 250
const DEFAULT_HOST = '127.0.0.1'
const LOCALHOST_URL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/\S*)?/i

/** Env var name segments that mark a value as a credential and get dropped from child env. */
const DENY_SEGMENTS = new Set([
  'KEY',
  'KEYS',
  'TOKEN',
  'TOKENS',
  'SECRET',
  'SECRETS',
  'PASSWORD',
  'PASSWD',
  'PWD',
  'CREDENTIAL',
  'CREDENTIALS',
  'PASSPHRASE',
  'AUTH',
])

export function isSecretEnvName(name: string): boolean {
  const upper = name.toUpperCase()
  return upper.split(/[_\-.]/).some((segment) => DENY_SEGMENTS.has(segment))
}

/**
 * Copy env with credential-named keys removed. A dev server still needs PATH,
 * HOME, NODE_ENV, PORT, etc.; it does not need our provider keys or tokens, and
 * a child that never sees them cannot leak them.
 */
export function sanitizeChildEnv(
  env: Record<string, string | undefined>,
  extraLayer?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (isSecretEnvName(name)) continue
    out[name] = value
  }
  // The explicit extra layer is caller-chosen; still scrub it so a dev command
  // can't smuggle a secret through spec.env.
  for (const [name, value] of Object.entries(extraLayer ?? {})) {
    if (isSecretEnvName(name)) continue
    out[name] = value
  }
  return out
}

function defaultSpawn(req: SpawnRequest): SupervisedHandle {
  const proc = Bun.spawn([req.program, ...req.args], {
    cwd: req.cwd,
    env: req.env,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return {
    pid: proc.pid,
    exited: proc.exited,
    kill: () => proc.kill(),
    stdout: proc.stdout as unknown as ReadableStream<Uint8Array> | null,
    stderr: proc.stderr as unknown as ReadableStream<Uint8Array> | null,
  }
}

async function defaultProbe(target: { url?: string; host: string; port?: number }): Promise<boolean> {
  if (target.url) {
    try {
      const res = await fetch(target.url, { method: 'GET', signal: AbortSignal.timeout(1500) })
      await res.body?.cancel().catch(() => {})
      return true
    } catch {
      return false
    }
  }
  if (target.port == null) return true
  const port = target.port
  return await new Promise<boolean>((resolve) => {
    const socket = connect({ host: target.host, port })
    const finish = (ok: boolean): void => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(1500)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function portFromUrl(url: string): number | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.port) return Number(parsed.port)
    return parsed.protocol === 'https:' ? 443 : 80
  } catch {
    return undefined
  }
}

interface Entry {
  readonly proc: ManagedProcess
  readonly handle: SupervisedHandle
}

export class ProcessSupervisor {
  private readonly spawn: ProcessSpawner
  private readonly probe: ReadinessProbe
  private readonly baseEnv: Record<string, string | undefined>
  private readonly entries = new Map<string, Entry>()

  constructor(options: SupervisorOptions = {}) {
    this.spawn = options.spawn ?? defaultSpawn
    this.probe = options.probe ?? defaultProbe
    this.baseEnv = options.baseEnv ?? (process.env as Record<string, string | undefined>)
  }

  /** Spawn a background process and begin monitoring it. Returns immediately. */
  start(spec: ProcessSpec): ManagedProcess {
    const id = randomUUID()
    const proc: ManagedProcess = {
      id,
      label: spec.label ?? spec.command,
      command: spec.command,
      status: 'starting',
      startedAt: new Date().toISOString(),
    }
    if (spec.readiness?.url) {
      proc.url = spec.readiness.url
      proc.port = spec.readiness.port ?? portFromUrl(spec.readiness.url)
    } else if (spec.readiness?.port != null) {
      proc.port = spec.readiness.port
    }

    const env = sanitizeChildEnv(this.baseEnv, spec.env)
    const handle = this.spawn({ program: 'sh', args: ['-c', spec.command], cwd: spec.cwd, env })
    proc.pid = handle.pid

    const entry: Entry = { proc, handle }
    this.entries.set(id, entry)

    if (!spec.readiness) proc.status = 'running'
    this.watchExit(entry)
    if (spec.readiness && !spec.readiness.url) this.scrapeUrl(entry, spec.readiness.urlFromLog)

    return proc
  }

  /** Poll readiness until the process is ready, exits, or the deadline passes. */
  async waitUntilReady(id: string, timeoutMs?: number): Promise<ManagedProcess> {
    const entry = this.entries.get(id)
    if (!entry) throw new Error(`unknown process ${id}`)
    const { proc } = entry
    const budget = timeoutMs ?? DEFAULT_TIMEOUT_MS
    const interval = DEFAULT_INTERVAL_MS
    const deadline = Date.now() + budget

    while (Date.now() < deadline) {
      // proc.status is mutated asynchronously by watchExit, so read it fresh
      // through a widened alias each pass rather than trusting flow narrowing.
      const status: ProcessStatus = proc.status
      if (status === 'exited' || status === 'failed' || status === 'ready') return proc
      if (proc.url !== undefined || proc.port !== undefined) {
        const ok = await this.probe({ url: proc.url, host: DEFAULT_HOST, port: proc.port })
        const after: ProcessStatus = proc.status
        if (ok && after !== 'exited' && after !== 'failed') {
          proc.status = 'ready'
          proc.readyAt = new Date().toISOString()
          return proc
        }
      }
      await delay(interval)
    }
    return proc
  }

  get(id: string): ManagedProcess | undefined {
    return this.entries.get(id)?.proc
  }

  list(): ManagedProcess[] {
    return Array.from(this.entries.values(), (e) => e.proc)
  }

  /** Terminate one process and await its exit. Idempotent. */
  async stop(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) return
    try {
      entry.handle.kill()
    } catch {
      // already gone
    }
    await entry.handle.exited.catch(() => {})
  }

  /** Terminate every managed process. Called at run end — leaves no zombies. */
  async shutdown(): Promise<void> {
    await Promise.all(Array.from(this.entries.keys(), (id) => this.stop(id)))
    this.entries.clear()
  }

  private watchExit(entry: Entry): void {
    void entry.handle.exited.then((code) => {
      entry.proc.exitCode = code
      if (entry.proc.status !== 'ready') {
        entry.proc.status = code === 0 ? 'exited' : 'failed'
        if (code !== 0) entry.proc.error = `process exited with code ${code} before ready`
      } else {
        entry.proc.status = 'exited'
      }
    })
  }

  private scrapeUrl(entry: Entry, pattern?: RegExp): void {
    const record = (url: string): void => {
      entry.proc.url = url
      entry.proc.port = portFromUrl(url) ?? entry.proc.port
    }
    for (const stream of [entry.handle.stdout, entry.handle.stderr]) {
      if (!stream) continue
      void this.readLines(stream, (line) => {
        if (entry.proc.url) return
        // Prefer a clean localhost URL scraped from anywhere in the line; fall
        // back to a caller-supplied pattern (capture group 1, else full match).
        const local = line.match(LOCALHOST_URL)
        if (local) return record(local[0])
        if (!pattern) return
        const custom = line.match(pattern)
        if (custom) record(custom[1] ?? custom[0])
      })
    }
  }

  private async readLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl = buffer.indexOf('\n')
        while (nl !== -1) {
          onLine(buffer.slice(0, nl))
          buffer = buffer.slice(nl + 1)
          nl = buffer.indexOf('\n')
        }
      }
      if (buffer) onLine(buffer)
    } catch {
      // stream torn down on kill; nothing to scrape
    } finally {
      reader.releaseLock()
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

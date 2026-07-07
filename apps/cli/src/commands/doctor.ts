import { resolveToken, validateApiKey, type ResolvedToken } from '@orchentra/cli-api'
import { statfs } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type DoctorStatus = 'pass' | 'fail' | 'warn'

export interface DoctorCheck {
  name: string
  status: DoctorStatus
  message?: string
  durationMs: number
}

/** Working-tree facts the `git-repo` check reports on. */
export interface DoctorGitStatus {
  readonly isRepo: boolean
  readonly clean: boolean
  readonly hasRemote: boolean
}

export interface DoctorOptions {
  resolveToken?: () => ResolvedToken | null
  validateApiKey?: () => { valid: boolean; error?: string }
  diskAvailable?: () => number | Promise<number>
  fetchProvider?: (url: string, signal: AbortSignal) => Promise<Response>
  gitRepo?: () => DoctorGitStatus | Promise<DoctorGitStatus>
  env?: () => Record<string, string | undefined>
  reporter?: (check: DoctorCheck) => void
}

const DISK_WARN_BYTES = 50 * 1024 * 1024
const PROVIDER_TIMEOUT_MS = 5000
const PROVIDER_URL = 'https://api.anthropic.com/v1/models'

/** Env vars any one of which supplies provider auth (canonical §6). */
const AUTH_ENV_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'] as const

export async function runDoctor(options: DoctorOptions = {}): Promise<number> {
  const tokenFn = options.resolveToken ?? (() => resolveToken())
  const apiKeyFn = options.validateApiKey ?? (() => validateApiKey())
  const diskFn = options.diskAvailable ?? (async () => defaultDiskAvailable())
  const fetchFn =
    options.fetchProvider ??
    (async (url: string, signal: AbortSignal) => fetch(url, { method: 'GET', signal } as RequestInit))
  const gitFn = options.gitRepo ?? (async () => defaultGitStatus())
  const envFn = options.env ?? (() => process.env)
  const report = options.reporter ?? defaultReporter()

  const checks: DoctorCheck[] = []

  checks.push(await checkGithubToken(tokenFn))
  checks.push(await checkApiKey(apiKeyFn))
  checks.push(await checkProvider(fetchFn))
  checks.push(await checkDisk(diskFn))
  checks.push(await checkGitRepo(gitFn))
  checks.push(checkEnvVars(envFn))

  for (const check of checks) report(check)

  return checks.some((c) => c.status === 'fail') ? 1 : 0
}

async function checkGithubToken(fn: () => ResolvedToken | null): Promise<DoctorCheck> {
  const start = performance.now()
  const result = fn()
  const durationMs = Math.round(performance.now() - start)
  if (!result) {
    return { name: 'github-token', status: 'fail', message: 'no GitHub token found', durationMs }
  }
  return { name: 'github-token', status: 'pass', message: `source: ${result.source}`, durationMs }
}

async function checkApiKey(fn: () => { valid: boolean; error?: string }): Promise<DoctorCheck> {
  const start = performance.now()
  const result = fn()
  const durationMs = Math.round(performance.now() - start)
  if (!result.valid) {
    return { name: 'api-key', status: 'fail', message: result.error ?? 'invalid', durationMs }
  }
  return { name: 'api-key', status: 'pass', durationMs }
}

async function checkProvider(fetchFn: (url: string, signal: AbortSignal) => Promise<Response>): Promise<DoctorCheck> {
  const start = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  try {
    const resp = await fetchFn(PROVIDER_URL, controller.signal)
    const durationMs = Math.round(performance.now() - start)
    if (resp.ok || resp.status === 401) {
      return { name: 'provider', status: 'pass', message: `status ${resp.status}`, durationMs }
    }
    return { name: 'provider', status: 'fail', message: `status ${resp.status}`, durationMs }
  } catch (err) {
    const durationMs = Math.round(performance.now() - start)
    return {
      name: 'provider',
      status: 'fail',
      message: err instanceof Error ? err.message : String(err),
      durationMs,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function checkDisk(fn: () => number | Promise<number>): Promise<DoctorCheck> {
  const start = performance.now()
  const available = await fn()
  const durationMs = Math.round(performance.now() - start)
  if (available < 0) {
    return { name: 'disk', status: 'warn', message: 'could not determine disk space', durationMs }
  }
  if (available < DISK_WARN_BYTES) {
    return {
      name: 'disk',
      status: 'warn',
      message: `${Math.round(available / 1024 / 1024)}MB available`,
      durationMs,
    }
  }
  return { name: 'disk', status: 'pass', message: `${Math.round(available / 1024 / 1024)}MB available`, durationMs }
}

async function checkGitRepo(fn: () => DoctorGitStatus | Promise<DoctorGitStatus>): Promise<DoctorCheck> {
  const start = performance.now()
  const status = await fn()
  const durationMs = Math.round(performance.now() - start)
  if (!status.isRepo) {
    return { name: 'git-repo', status: 'warn', message: 'not a git repository', durationMs }
  }
  const parts = [status.clean ? 'clean' : 'uncommitted changes', status.hasRemote ? 'remote configured' : 'no remote']
  return { name: 'git-repo', status: 'pass', message: parts.join(' · '), durationMs }
}

function checkEnvVars(env: () => Record<string, string | undefined>): DoctorCheck {
  const start = performance.now()
  const values = env()
  const present = AUTH_ENV_VARS.filter((name) => (values[name] ?? '').length > 0)
  const durationMs = Math.round(performance.now() - start)
  if (present.length > 0) {
    return { name: 'env-vars', status: 'pass', message: `set: ${present.join(', ')}`, durationMs }
  }
  return {
    name: 'env-vars',
    status: 'warn',
    message: `none set (${AUTH_ENV_VARS.join(', ')}); relying on stored credentials`,
    durationMs,
  }
}

async function defaultGitStatus(): Promise<DoctorGitStatus> {
  try {
    const inside = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'])
    if (inside.stdout.trim() !== 'true') return { isRepo: false, clean: false, hasRemote: false }
    const [porcelain, remotes] = await Promise.all([
      execFileAsync('git', ['status', '--porcelain']),
      execFileAsync('git', ['remote']),
    ])
    return {
      isRepo: true,
      clean: porcelain.stdout.trim().length === 0,
      hasRemote: remotes.stdout.trim().length > 0,
    }
  } catch {
    return { isRepo: false, clean: false, hasRemote: false }
  }
}

async function defaultDiskAvailable(): Promise<number> {
  try {
    const info = await statfs(homedir())
    return (info as { bavail?: number; bsize?: number; blocks?: number }).bavail! * (info as { bsize?: number }).bsize!
  } catch {
    return -1
  }
}

function defaultReporter(): (check: DoctorCheck) => void {
  return (check) => {
    const icon = check.status === 'pass' ? '+' : check.status === 'fail' ? 'x' : '!'
    const msg = check.message ? ` — ${check.message}` : ''
    process.stdout.write(`  [${icon}] ${check.name} (${check.durationMs}ms)${msg}\n`)
  }
}

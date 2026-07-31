/**
 * Fire-and-capture child process execution.
 *
 * Long-lived processes belong to `ProcessSupervisor`. This module covers only
 * the "run it, collect both streams, read the exit code" case, which was
 * previously re-implemented at every call site that needed it.
 */

export interface ProcessResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface RunProcessOptions {
  cwd?: string
  env?: Record<string, string>
  /** Written to the child's stdin, which is then closed. */
  stdin?: string
}

export async function runProcess(command: string[], options: RunProcessOptions = {}): Promise<ProcessResult> {
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env,
    stdin: options.stdin === undefined ? 'ignore' : new TextEncoder().encode(options.stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

export function runProcessSync(command: string[], options: RunProcessOptions = {}): ProcessResult {
  const proc = Bun.spawnSync(command, {
    cwd: options.cwd,
    env: options.env,
    stdin: options.stdin === undefined ? undefined : new TextEncoder().encode(options.stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const decoder = new TextDecoder()
  return {
    stdout: decoder.decode(proc.stdout),
    stderr: decoder.decode(proc.stderr),
    exitCode: proc.exitCode ?? 0,
  }
}

/**
 * `process.env` with every `GIT_*` variable removed, so an explicit `cwd` is
 * the only repository-discovery input.
 *
 * Without this, running inside a git hook (which exports GIT_DIR /
 * GIT_WORK_TREE / GIT_INDEX_FILE to child processes) makes git ignore `cwd`
 * and report the enclosing repository instead.
 *
 * This strips `GIT_*` wholesale, including credential and identity variables
 * such as GIT_SSH_COMMAND and GIT_AUTHOR_NAME. That is correct for read-only
 * discovery probes, and wrong for commands that authenticate or write history
 * — those should scrub a targeted key list instead.
 */
export function gitDiscoveryEnv(source: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && !key.startsWith('GIT_')) env[key] = value
  }
  return env
}

/**
 * The `GIT_*` variables that redirect git at a different repository. Git
 * exports these to child processes during a hook, so any git command run by a
 * process that was itself spawned from a hook inherits them and silently
 * operates on the hooked repository instead of its own `cwd`.
 */
const GIT_REPO_DISCOVERY_KEYS = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
] as const

/**
 * Environment for git commands that authenticate or write history.
 *
 * Drops only the repository-discovery variables, so `cwd` stays authoritative
 * while GIT_SSH_COMMAND, GIT_ASKPASS, GIT_AUTHOR_* and GIT_COMMITTER_* survive
 * — stripping those would break pushes over SSH and lose commit identity.
 *
 * Use `gitDiscoveryEnv` instead for read-only probes, where nothing needs to
 * authenticate and the blunter strip is safe.
 */
export function gitCommandEnv(source: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) env[key] = value
  }
  for (const key of GIT_REPO_DISCOVERY_KEYS) delete env[key]
  return env
}

/** Trimmed stdout of a git command run against `cwd`, or null if it failed. */
export function gitOutput(cwd: string, args: string[]): string | null {
  try {
    const result = runProcessSync(['git', ...args], { cwd, env: gitDiscoveryEnv() })
    if (result.exitCode !== 0) return null
    return result.stdout.trim()
  } catch {
    return null
  }
}

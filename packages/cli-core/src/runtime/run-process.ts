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

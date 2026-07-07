import { randomUUID } from 'node:crypto'
import { loadHooks } from './load-hooks'
import { matchHooks } from './match'
import { runHook } from './run-hook'
import type { HookConfig, HookExecutionContext, HookFireResult, HookProgressUpdate } from './types'

export interface HookRunnerOptions {
  /**
   * Working directory the hook config is read from. The runner looks for
   * `.orchentra/hooks.json` under this path. Operators expect this to match
   * the CLI's `cwd` so a repo's hooks file lives with the repo.
   */
  readonly cwd: string

  /**
   * Pre-loaded config. When provided, the runner uses this instead of reading
   * `.orchentra/hooks.json`. Primarily useful in tests; production callers
   * pass `cwd` and let `loadHooks` parse the file.
   */
  readonly config?: HookConfig

  /**
   * Live progress callback fired around each hook that actually runs, so the
   * UI can show a "running hook…" row that resolves to pass/fail. Only invoked
   * when a hook matches — silent when nothing runs.
   */
  readonly onProgress?: (update: HookProgressUpdate) => void
}

export interface HookRunner {
  firePreToolUse(toolName: string, args: unknown): Promise<HookFireResult>
  firePostToolUse(toolName: string, args: unknown, resultOrError: string | Error): Promise<HookFireResult>
}

const NOOP_RESULT: HookFireResult = { blocked: false }

/**
 * Construct a hook runner bound to the given workspace. Reads
 * `.orchentra/hooks.json` once at construction time so a malformed file
 * doesn't surprise the user mid-session — operators must restart the CLI
 * to reload hooks.
 */
export function createHookRunner(options: HookRunnerOptions): HookRunner {
  const config = options.config ?? loadHooks(options.cwd)
  const onProgress = options.onProgress

  function report(event: 'pre_tool_use' | 'post_tool_use', tool: string, command: string): (ok: boolean) => void {
    if (!onProgress) return () => {}
    const id = randomUUID()
    onProgress({ id, phase: 'running', event, tool, command })
    return (ok) => onProgress({ id, phase: 'done', ok, event, tool, command })
  }

  return {
    async firePreToolUse(toolName, args): Promise<HookFireResult> {
      const hooks = matchHooks(config, 'pre_tool_use', toolName)
      if (hooks.length === 0) return NOOP_RESULT

      const annotations: string[] = []
      for (const hook of hooks) {
        const ctx: HookExecutionContext = { event: 'pre_tool_use', tool: toolName, args }
        const done = report('pre_tool_use', toolName, hook.command)
        const result = await runHook(hook, ctx)
        done(result.exitCode === 0)
        if (result.exitCode !== 0) {
          const reason = result.stderr.trim() || `${hook.command} exited with code ${result.exitCode}`
          return { blocked: true, blockedReason: reason, annotations: annotations.length > 0 ? annotations : undefined }
        }
        const stdout = result.stdout.trim()
        if (stdout.length > 0) annotations.push(stdout)
      }

      return annotations.length > 0 ? { blocked: false, annotations } : NOOP_RESULT
    },

    async firePostToolUse(toolName, args, resultOrError): Promise<HookFireResult> {
      const hooks = matchHooks(config, 'post_tool_use', toolName)
      if (hooks.length === 0) return NOOP_RESULT

      const ctx: HookExecutionContext = {
        event: 'post_tool_use',
        tool: toolName,
        args,
        ...(resultOrError instanceof Error ? { error: resultOrError.message } : { result: resultOrError }),
      }

      const annotations: string[] = []
      for (const hook of hooks) {
        const done = report('post_tool_use', toolName, hook.command)
        const result = await runHook(hook, ctx)
        done(result.exitCode === 0)
        const stdout = result.stdout.trim()
        if (stdout.length > 0) annotations.push(stdout)
      }

      return annotations.length > 0 ? { blocked: false, annotations } : NOOP_RESULT
    },
  }
}

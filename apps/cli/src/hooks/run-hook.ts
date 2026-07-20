import { spawn } from 'node:child_process'
import type { HookExecutionContext, HookMatch, HookResult, LifecycleHookContext } from './types'

/**
 * Spawn the hook's command via the system shell, pipe the JSON-encoded
 * `context` to stdin, and collect the result. Never throws — process spawn
 * failures surface as `exitCode === -1` with the failure message in stderr.
 */
export function runHook(hook: HookMatch, context: HookExecutionContext | LifecycleHookContext): Promise<HookResult> {
  return new Promise((resolve) => {
    const start = Date.now()
    const child = spawn(hook.command, { shell: true })

    let stdout = ''
    let stderr = ''
    let settled = false

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      resolve({
        exitCode: -1,
        stdout,
        stderr: stderr.length > 0 ? stderr : err.message,
        durationMs: Date.now() - start,
      })
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
        durationMs: Date.now() - start,
      })
    })

    try {
      child.stdin.write(JSON.stringify(context))
      child.stdin.end()
    } catch {
      // EPIPE if the child exited before stdin was written. The 'close' handler
      // above will still resolve the promise with the captured exit code.
    }
  })
}

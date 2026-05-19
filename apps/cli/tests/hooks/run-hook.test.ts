import { describe, test, expect } from 'bun:test'
import { join } from 'node:path'
import { runHook } from '../../src/hooks/run-hook'
import type { HookExecutionContext, HookMatch } from '../../src/hooks/types'

const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'hooks')

function fixture(name: string): string {
  return join(FIXTURE_DIR, name)
}

const CTX: HookExecutionContext = {
  event: 'pre_tool_use',
  tool: 'Bash',
  args: { command: 'ls' },
}

describe('runHook', () => {
  test('spawns the command and returns exit 0 + stdout', async () => {
    const hook: HookMatch = { event: 'pre_tool_use', tools: ['Bash'], command: fixture('annotate.sh') }
    const result = await runHook(hook, CTX)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe('post-hook ran')
    expect(result.stderr).toBe('')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  test('returns exit 1 + stderr when command fails', async () => {
    const hook: HookMatch = { event: 'pre_tool_use', tools: ['Bash'], command: fixture('fail.sh') }
    const result = await runHook(hook, CTX)
    expect(result.exitCode).toBe(1)
    expect(result.stderr.trim()).toBe('blocked by fixture')
  })

  test('pipes JSON-encoded context to the hook on stdin', async () => {
    const hook: HookMatch = { event: 'pre_tool_use', tools: ['Bash'], command: fixture('echo-stdin.sh') }
    const result = await runHook(hook, CTX)
    expect(result.exitCode).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.event).toBe('pre_tool_use')
    expect(parsed.tool).toBe('Bash')
    expect(parsed.args).toEqual({ command: 'ls' })
  })

  test('captures non-zero exit from a missing command without throwing', async () => {
    const hook: HookMatch = { event: 'pre_tool_use', tools: ['Bash'], command: '/nonexistent/binary-does-not-exist' }
    const result = await runHook(hook, CTX)
    expect(result.exitCode).not.toBe(0)
  })

  test('passes result + error fields through to stdin for post_tool_use', async () => {
    const hook: HookMatch = { event: 'post_tool_use', tools: ['Bash'], command: fixture('echo-stdin.sh') }
    const postCtx: HookExecutionContext = {
      event: 'post_tool_use',
      tool: 'Bash',
      args: { command: 'ls' },
      result: 'a.txt\nb.txt',
    }
    const result = await runHook(hook, postCtx)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.event).toBe('post_tool_use')
    expect(parsed.result).toBe('a.txt\nb.txt')
  })
})

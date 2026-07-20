import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHookRunner } from '../../src/hooks/hook-runner'
import { CliCoreHookAdapter } from '../../src/hooks/cli-core-adapter'
import { loadHooks } from '../../src/hooks/load-hooks'
import { matchLifecycleHooks } from '../../src/hooks/match'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'orchentra-hook-lifecycle-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

function writeHookConfig(hooks: Array<Record<string, unknown>>): void {
  mkdirSync(join(tempDir, '.orchentra'), { recursive: true })
  writeFileSync(join(tempDir, '.orchentra', 'hooks.json'), JSON.stringify({ version: 1, hooks }))
}

function writeScript(name: string, body: string): string {
  const path = join(tempDir, name)
  writeFileSync(path, body)
  chmodSync(path, 0o755)
  return path
}

describe('lifecycle hook config', () => {
  test('loads a lifecycle event with no tools field (defaults to [])', () => {
    writeHookConfig([{ event: 'session_start', command: 'true' }])
    const config = loadHooks(tempDir)
    expect(config.hooks).toHaveLength(1)
    expect(config.hooks[0].event).toBe('session_start')
    expect(config.hooks[0].tools).toEqual([])
  })

  test('accepts all six lifecycle events', () => {
    const events = ['session_start', 'session_end', 'pre_compact', 'post_compact', 'subagent_start', 'subagent_stop']
    writeHookConfig(events.map((event) => ({ event, command: 'true' })))
    const config = loadHooks(tempDir)
    expect(config.hooks.map((h) => h.event).sort()).toEqual([...events].sort())
  })

  test('matchLifecycleHooks matches on event alone, ignoring tools', () => {
    writeHookConfig([
      { event: 'pre_compact', tools: ['Bash'], command: 'true' },
      { event: 'post_compact', command: 'true' },
    ])
    const config = loadHooks(tempDir)
    expect(matchLifecycleHooks(config, 'pre_compact')).toHaveLength(1)
    expect(matchLifecycleHooks(config, 'post_compact')).toHaveLength(1)
    expect(matchLifecycleHooks(config, 'session_start')).toHaveLength(0)
  })
})

describe('fireLifecycle', () => {
  test('runs a matching lifecycle hook and captures its stdout', async () => {
    const ann = writeScript('start.sh', '#!/bin/sh\necho session-began\n')
    writeHookConfig([{ event: 'session_start', command: ann }])
    const runner = createHookRunner({ cwd: tempDir })
    const annotations = await runner.fireLifecycle('session_start', { sessionId: 's1' })
    expect(annotations).toEqual(['session-began'])
  })

  test('pipes the event and payload to the hook on stdin', async () => {
    const echo = writeScript('echo.sh', '#!/bin/sh\ncat\n')
    writeHookConfig([{ event: 'subagent_start', command: echo }])
    const runner = createHookRunner({ cwd: tempDir })
    const [json] = await runner.fireLifecycle('subagent_start', { toolCallId: 'abc' })
    const parsed = JSON.parse(json ?? '{}')
    expect(parsed.event).toBe('subagent_start')
    expect(parsed.toolCallId).toBe('abc')
  })

  test('a non-zero exit neither throws nor blocks', async () => {
    const fail = writeScript('fail.sh', '#!/bin/sh\nexit 9\n')
    writeHookConfig([{ event: 'session_end', command: fail }])
    const runner = createHookRunner({ cwd: tempDir })
    const annotations = await runner.fireLifecycle('session_end')
    expect(annotations).toEqual([])
  })

  test('does not fire on an unrelated lifecycle event', async () => {
    const marker = join(tempDir, 'ran')
    writeHookConfig([{ event: 'session_start', command: `touch ${marker}` }])
    const runner = createHookRunner({ cwd: tempDir })
    await runner.fireLifecycle('session_end')
    expect(existsSync(marker)).toBe(false)
  })

  test('a tool hook is not fired by a lifecycle event', async () => {
    const marker = join(tempDir, 'tool-ran')
    writeHookConfig([{ event: 'pre_tool_use', tools: ['*'], command: `touch ${marker}` }])
    const runner = createHookRunner({ cwd: tempDir })
    await runner.fireLifecycle('session_start')
    expect(existsSync(marker)).toBe(false)
  })
})

describe('CliCoreHookAdapter.runLifecycle', () => {
  test('maps a PascalCase core event to the snake_case engine event and runs it', async () => {
    const marker = join(tempDir, 'session-start-ran')
    writeHookConfig([{ event: 'session_start', command: `touch ${marker}` }])
    const adapter = new CliCoreHookAdapter(tempDir)
    await adapter.runLifecycle('SessionStart', { sessionId: 's1' })
    expect(existsSync(marker)).toBe(true)
  })

  test('base HookRunner (no adapter) treats runLifecycle as a no-op', async () => {
    // The cli-core base runner has no lifecycle hooks; calling it must not throw.
    const { HookRunner } = await import('@orchentra/cli-core')
    await new HookRunner().runLifecycle('PreCompact', {})
  })
})

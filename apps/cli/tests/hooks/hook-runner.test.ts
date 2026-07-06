import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHookRunner } from '../../src/hooks/hook-runner'
import type { HookProgressUpdate } from '../../src/hooks/types'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'orchentra-hook-runner-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

function writeHookConfig(hooks: Array<{ event: string; tools: string[]; command: string }>): void {
  mkdirSync(join(tempDir, '.orchentra'), { recursive: true })
  writeFileSync(join(tempDir, '.orchentra', 'hooks.json'), JSON.stringify({ version: 1, hooks }))
}

function writeScript(name: string, body: string): string {
  const path = join(tempDir, name)
  writeFileSync(path, body)
  chmodSync(path, 0o755)
  return path
}

describe('createHookRunner — no config', () => {
  test('firePreToolUse returns { blocked: false } when no hooks.json exists', async () => {
    const runner = createHookRunner({ cwd: tempDir })
    const result = await runner.firePreToolUse('Bash', { command: 'ls' })
    expect(result.blocked).toBe(false)
    expect(result.blockedReason).toBeUndefined()
  })

  test('firePostToolUse returns { blocked: false } when no hooks.json exists', async () => {
    const runner = createHookRunner({ cwd: tempDir })
    const result = await runner.firePostToolUse('Bash', { command: 'ls' }, 'ok')
    expect(result.blocked).toBe(false)
    expect(result.annotations).toBeUndefined()
  })
})

describe('createHookRunner — pre_tool_use', () => {
  test('exit 0 → not blocked', async () => {
    const ok = writeScript('ok.sh', '#!/bin/sh\nexit 0\n')
    writeHookConfig([{ event: 'pre_tool_use', tools: ['Bash'], command: ok }])
    const runner = createHookRunner({ cwd: tempDir })
    const result = await runner.firePreToolUse('Bash', { command: 'ls' })
    expect(result.blocked).toBe(false)
  })

  test('exit 1 → blocked with stderr in blockedReason', async () => {
    const fail = writeScript('fail.sh', '#!/bin/sh\necho "no rm -rf" >&2\nexit 1\n')
    writeHookConfig([{ event: 'pre_tool_use', tools: ['Bash'], command: fail }])
    const runner = createHookRunner({ cwd: tempDir })
    const result = await runner.firePreToolUse('Bash', { command: 'rm -rf /' })
    expect(result.blocked).toBe(true)
    expect(result.blockedReason).toContain('no rm -rf')
  })

  test('blockedReason falls back to a generic message when stderr is empty', async () => {
    const silent = writeScript('silent.sh', '#!/bin/sh\nexit 1\n')
    writeHookConfig([{ event: 'pre_tool_use', tools: ['Bash'], command: silent }])
    const runner = createHookRunner({ cwd: tempDir })
    const result = await runner.firePreToolUse('Bash', { command: 'rm -rf /' })
    expect(result.blocked).toBe(true)
    expect(typeof result.blockedReason).toBe('string')
    expect((result.blockedReason ?? '').length).toBeGreaterThan(0)
  })

  test('does not run hooks that do not match the tool', async () => {
    const fail = writeScript('fail.sh', '#!/bin/sh\necho should-not-run >&2\nexit 1\n')
    writeHookConfig([{ event: 'pre_tool_use', tools: ['OtherTool'], command: fail }])
    const runner = createHookRunner({ cwd: tempDir })
    const result = await runner.firePreToolUse('Bash', { command: 'ls' })
    expect(result.blocked).toBe(false)
  })

  test('runs hooks in declaration order and stops at the first blocker', async () => {
    const ok = writeScript('ok.sh', '#!/bin/sh\nexit 0\n')
    const fail = writeScript('fail.sh', '#!/bin/sh\necho blocked-by-second >&2\nexit 1\n')
    const shouldNotRun = writeScript('panic.sh', '#!/bin/sh\necho ran-after-blocker >&1\nexit 0\n')
    writeHookConfig([
      { event: 'pre_tool_use', tools: ['Bash'], command: ok },
      { event: 'pre_tool_use', tools: ['Bash'], command: fail },
      { event: 'pre_tool_use', tools: ['Bash'], command: shouldNotRun },
    ])
    const runner = createHookRunner({ cwd: tempDir })
    const result = await runner.firePreToolUse('Bash', { command: 'ls' })
    expect(result.blocked).toBe(true)
    expect(result.blockedReason).toContain('blocked-by-second')
  })
})

describe('createHookRunner — progress', () => {
  test('emits running then done(ok=true) around a passing pre-hook, sharing an id', async () => {
    const ok = writeScript('ok.sh', '#!/bin/sh\nexit 0\n')
    writeHookConfig([{ event: 'pre_tool_use', tools: ['Bash'], command: ok }])
    const updates: HookProgressUpdate[] = []
    const runner = createHookRunner({ cwd: tempDir, onProgress: (u) => updates.push(u) })
    await runner.firePreToolUse('Bash', { command: 'ls' })
    expect(updates.map((u) => u.phase)).toEqual(['running', 'done'])
    expect(updates[0].id).toBe(updates[1].id)
    expect(updates[1].ok).toBe(true)
    expect(updates[0].command).toBe(ok)
  })

  test('emits done(ok=false) when a pre-hook blocks', async () => {
    const fail = writeScript('fail.sh', '#!/bin/sh\nexit 1\n')
    writeHookConfig([{ event: 'pre_tool_use', tools: ['Bash'], command: fail }])
    const updates: HookProgressUpdate[] = []
    const runner = createHookRunner({ cwd: tempDir, onProgress: (u) => updates.push(u) })
    await runner.firePreToolUse('Bash', { command: 'rm -rf /' })
    expect(updates[updates.length - 1]).toMatchObject({ phase: 'done', ok: false })
  })

  test('does not emit progress when no hook matches', async () => {
    writeHookConfig([{ event: 'pre_tool_use', tools: ['OtherTool'], command: writeScript('x.sh', '#!/bin/sh\n') }])
    const updates: HookProgressUpdate[] = []
    const runner = createHookRunner({ cwd: tempDir, onProgress: (u) => updates.push(u) })
    await runner.firePreToolUse('Bash', { command: 'ls' })
    expect(updates).toHaveLength(0)
  })
})

describe('createHookRunner — post_tool_use', () => {
  test('exit 0 → not blocked, annotations contain stdout', async () => {
    const ann = writeScript('annotate.sh', '#!/bin/sh\necho post-hook-ran\n')
    writeHookConfig([{ event: 'post_tool_use', tools: ['*'], command: ann }])
    const runner = createHookRunner({ cwd: tempDir })
    const result = await runner.firePostToolUse('Bash', { command: 'ls' }, 'file.txt')
    expect(result.blocked).toBe(false)
    expect(result.annotations).toEqual(['post-hook-ran'])
  })

  test('non-zero exit does NOT block the call (post-hooks never block)', async () => {
    const fail = writeScript('fail.sh', '#!/bin/sh\necho oh-well >&2\nexit 7\n')
    writeHookConfig([{ event: 'post_tool_use', tools: ['Bash'], command: fail }])
    const runner = createHookRunner({ cwd: tempDir })
    const result = await runner.firePostToolUse('Bash', { command: 'ls' }, 'ok')
    expect(result.blocked).toBe(false)
  })

  test('passes error payload through when result is an Error', async () => {
    const echo = writeScript('echo.sh', '#!/bin/sh\ncat\n')
    writeHookConfig([{ event: 'post_tool_use', tools: ['Bash'], command: echo }])
    const runner = createHookRunner({ cwd: tempDir })
    const err = new Error('command failed')
    const result = await runner.firePostToolUse('Bash', { command: 'ls' }, err)
    const stdin = JSON.parse(result.annotations?.[0] ?? '{}')
    expect(stdin.error).toBe('command failed')
    expect(stdin.result).toBeUndefined()
  })

  test('appends annotations across multiple matching hooks', async () => {
    const a = writeScript('a.sh', '#!/bin/sh\necho a-out\n')
    const b = writeScript('b.sh', '#!/bin/sh\necho b-out\n')
    writeHookConfig([
      { event: 'post_tool_use', tools: ['*'], command: a },
      { event: 'post_tool_use', tools: ['Bash'], command: b },
    ])
    const runner = createHookRunner({ cwd: tempDir })
    const result = await runner.firePostToolUse('Bash', { command: 'ls' }, 'ok')
    expect(result.annotations).toEqual(['a-out', 'b-out'])
  })
})

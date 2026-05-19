import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CliCoreHookAdapter } from '../../src/hooks/cli-core-adapter'

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hook-adapter-'))
  mkdirSync(join(dir, '.orchentra'), { recursive: true })
  return dir
}

function writeScript(dir: string, name: string, body: string): string {
  const path = join(dir, name)
  writeFileSync(path, body)
  chmodSync(path, 0o755)
  return path
}

function writeConfig(dir: string, hooks: Array<{ event: string; tools: string[]; command: string }>): void {
  writeFileSync(join(dir, '.orchentra', 'hooks.json'), JSON.stringify({ version: 1, hooks }))
}

describe('CliCoreHookAdapter', () => {
  test('no matching hooks → not denied, no messages', async () => {
    const dir = makeWorkspace()
    writeConfig(dir, [])
    const adapter = new CliCoreHookAdapter(dir)

    const result = await adapter.runPreToolUse('Bash', '{}')

    expect(result.denied).toBe(false)
    expect(result.messages).toEqual([])
  })

  test('pre-tool hook exit non-zero surfaces as denied with stderr as reason', async () => {
    const dir = makeWorkspace()
    const script = writeScript(dir, 'deny.sh', '#!/bin/sh\necho "blocked: dangerous bash" >&2\nexit 1\n')
    writeConfig(dir, [{ event: 'pre_tool_use', tools: ['Bash'], command: script }])
    const adapter = new CliCoreHookAdapter(dir)

    const result = await adapter.runPreToolUse('Bash', '{}')

    expect(result.denied).toBe(true)
    expect(result.messages[0]).toContain('blocked: dangerous bash')
  })

  test('pre-tool hook exit 0 with stdout surfaces as allow + annotation', async () => {
    const dir = makeWorkspace()
    const script = writeScript(dir, 'note.sh', '#!/bin/sh\necho "audit: bash invocation logged"\n')
    writeConfig(dir, [{ event: 'pre_tool_use', tools: ['*'], command: script }])
    const adapter = new CliCoreHookAdapter(dir)

    const result = await adapter.runPreToolUse('Bash', '{}')

    expect(result.denied).toBe(false)
    expect(result.messages).toEqual(['audit: bash invocation logged'])
  })

  test('post-tool hook stdout becomes annotation message', async () => {
    const dir = makeWorkspace()
    const script = writeScript(dir, 'log.sh', '#!/bin/sh\necho "post-log: Bash completed"\n')
    writeConfig(dir, [{ event: 'post_tool_use', tools: ['Bash'], command: script }])
    const adapter = new CliCoreHookAdapter(dir)

    const result = await adapter.runPostToolUse('Bash', '{}', 'tool output', false)

    expect(result.denied).toBe(false)
    expect(result.messages).toEqual(['post-log: Bash completed'])
  })

  test('post-tool failure path also fires post_tool_use hooks with error message', async () => {
    const dir = makeWorkspace()
    const script = writeScript(dir, 'err-log.sh', '#!/bin/sh\necho "failure-recorded"\n')
    writeConfig(dir, [{ event: 'post_tool_use', tools: ['Bash'], command: script }])
    const adapter = new CliCoreHookAdapter(dir)

    const result = await adapter.runPostToolUseFailure('Bash', '{}', 'command failed: exit 7')

    expect(result.denied).toBe(false)
    expect(result.messages).toEqual(['failure-recorded'])
  })
})

import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

const CLI_ENTRY = resolve(import.meta.dir, '..', 'src', 'main.ts')

describe('orchentra -p (free-form prompt) is removed (Slice F)', () => {
  test('exits non-zero and prints the slash-only hint when -p is supplied', async () => {
    const proc = Bun.spawn({
      cmd: ['bun', CLI_ENTRY, '-p', 'hello world'],
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, ORCHENTRA_ALLOWED_REPOS: 'my-org/api' },
    })
    const stderr = await new Response(proc.stderr).text()
    const exit = await proc.exited
    expect(exit).not.toBe(0)
    expect(stderr.toLowerCase()).toContain('slash-command')
    expect(stderr.toLowerCase()).toContain('claude code')
  })
})

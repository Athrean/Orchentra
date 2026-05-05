import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { operations } from '@orchentra/operations'
import { buildToolsJson } from '../src/commands/mcp-serve'

const CLI_ENTRY = resolve(import.meta.dir, '..', 'src', 'main.ts')

interface SubprocessResult {
  stdout: string
  stderr: string
  exitCode: number
}

async function runCli(args: string[], opts: { stdin?: string; timeoutMs?: number } = {}): Promise<SubprocessResult> {
  const proc = Bun.spawn(['bun', CLI_ENTRY, ...args], {
    stdin: opts.stdin === undefined ? 'ignore' : 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ORCHENTRA_NO_CLAUDE_CODE_IMPORT: '1' },
  })

  if (opts.stdin !== undefined && proc.stdin) {
    proc.stdin.write(opts.stdin)
    proc.stdin.end()
  }

  const timeoutMs = opts.timeoutMs ?? 5_000
  const timer = setTimeout(() => {
    try {
      proc.kill('SIGKILL')
    } catch {
      /* already exited */
    }
  }, timeoutMs)

  const exitCode = await proc.exited
  clearTimeout(timer)
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return { stdout, stderr, exitCode }
}

describe('orchentra mcp serve --print-tools-json', () => {
  test('prints a JSON array of tool definitions and exits 0', async () => {
    const { stdout, exitCode } = await runCli(['mcp', 'serve', '--print-tools-json'])
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(operations.length)
  })

  test('every entry carries name, description, and inputSchema', async () => {
    const { stdout } = await runCli(['mcp', 'serve', '--print-tools-json'])
    const parsed = JSON.parse(stdout) as unknown[]
    for (const entry of parsed) {
      expect(entry).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        inputSchema: expect.any(Object),
      })
    }
  })

  test('every inputSchema is valid JSONSchema with a type field', async () => {
    const { stdout } = await runCli(['mcp', 'serve', '--print-tools-json'])
    const parsed = JSON.parse(stdout) as Array<{ inputSchema: { type?: unknown } }>
    for (const entry of parsed) {
      expect(typeof entry.inputSchema.type).toBe('string')
    }
  })

  test('exits without blocking on stdin (no MCP server boot)', async () => {
    // If the server were started the subprocess would block on stdin and the
    // timeout would kill it, surfacing a non-zero (SIGKILL) exit code.
    const { exitCode } = await runCli(['mcp', 'serve', '--print-tools-json'], {
      stdin: '',
      timeoutMs: 5_000,
    })
    expect(exitCode).toBe(0)
  })

  test('without the flag, mcp serve does not short-circuit into the printer', async () => {
    // The real stdio server boot lands with #290; until then the stub exits
    // non-zero so we know we did not silently fall through to the printer.
    const { stdout, exitCode } = await runCli(['mcp', 'serve'])
    expect(exitCode).not.toBe(0)
    expect(stdout).toBe('')
  })
})

describe('buildToolsJson', () => {
  test('emits one entry per operation', () => {
    expect(buildToolsJson(operations)).toHaveLength(operations.length)
  })

  test('each entry has the MCP tools/list shape', () => {
    const entries = buildToolsJson(operations)
    for (const entry of entries) {
      expect(typeof entry.name).toBe('string')
      expect(typeof entry.description).toBe('string')
      expect(typeof entry.inputSchema).toBe('object')
      expect(typeof (entry.inputSchema as { type?: unknown }).type).toBe('string')
    }
  })
})

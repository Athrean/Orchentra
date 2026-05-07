import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getPullRequestOperation,
  setGithubAdapter,
  setRepoMonitoredCheck,
  type GithubAdapter,
} from '@orchentra/operations'
import { buildShellAction } from '../src/op-commands/factory'

const fakePullsAdapter = {
  pulls: {
    get: () =>
      Promise.resolve({
        data: {
          title: 'Add login flow',
          body: null,
          state: 'open',
          merged: false,
          user: { login: 'alice' },
          base: { ref: 'main' },
          head: { ref: 'feature/login' },
          created_at: '2026-04-01T10:00:00Z',
        },
      }),
    listFiles: () => Promise.resolve({ data: [] }),
    listReviewComments: () => Promise.resolve({ data: [] }),
  },
} as unknown as GithubAdapter

describe('--output-format json', () => {
  beforeEach(() => {
    setGithubAdapter(fakePullsAdapter)
    setRepoMonitoredCheck(async () => true)
  })
  afterEach(() => {
    /* noop */
  })

  test('emits a stable JSON envelope { executionId, nodeIds, result, error, durationMs }', async () => {
    const out: string[] = []
    const action = buildShellAction(getPullRequestOperation, {
      writeStdout: (line) => out.push(line),
      writeStderr: () => {},
    })

    const exit = await action(['--owner', 'Athrean', '--repo', 'Orchentra', '--number', '7', '--output-format', 'json'])
    expect(exit).toBe(0)

    const parsed = JSON.parse(out.join('\n')) as {
      executionId: string
      nodeIds: string[]
      result: { title: string }
      error: null | { code: string; message: string }
      durationMs: number
    }
    expect(typeof parsed.executionId).toBe('string')
    expect(parsed.executionId.length).toBeGreaterThan(0)
    expect(Array.isArray(parsed.nodeIds)).toBe(true)
    expect(parsed.error).toBeNull()
    expect(parsed.result.title).toBe('Add login flow')
    expect(typeof parsed.durationMs).toBe('number')
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0)
  })

  test('emits a JSON error envelope on validation failure with exit 1', async () => {
    const out: string[] = []
    const errs: string[] = []
    const action = buildShellAction(getPullRequestOperation, {
      writeStdout: (line) => out.push(line),
      writeStderr: (line) => errs.push(line),
    })

    const exit = await action(['--owner', 'Athrean', '--output-format', 'json'])
    expect(exit).toBe(1)
    const parsed = JSON.parse(out.join('\n')) as {
      executionId: string
      result: null
      error: { code: string; message: string }
    }
    expect(parsed.error).not.toBeNull()
    expect(parsed.error.code).toBe('invalid_input')
    expect(parsed.result).toBeNull()
  })

  test('text mode is unchanged when --output-format is omitted', async () => {
    const out: string[] = []
    const action = buildShellAction(getPullRequestOperation, {
      writeStdout: (line) => out.push(line),
      writeStderr: () => {},
    })

    const exit = await action(['--owner', 'Athrean', '--repo', 'Orchentra', '--number', '7'])
    expect(exit).toBe(0)
    // Text mode = stringified result; should NOT be the JSON envelope.
    expect(out.join('\n')).toContain('Add login flow')
    expect(out.join('\n')).not.toContain('"executionId"')
  })
})

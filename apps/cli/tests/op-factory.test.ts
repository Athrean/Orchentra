import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getPullRequestOperation,
  setGithubAdapter,
  setRepoMonitoredCheck,
  type GithubAdapter,
} from '@orchentra/operations'
import { buildShellAction, buildSlashHandlerArgs } from '../src/op-commands/factory'

const fakeAdapter = {
  pulls: {
    get: () =>
      Promise.resolve({
        data: {
          title: 'Add login flow',
          body: 'Adds login',
          state: 'open',
          merged: false,
          user: { login: 'alice' },
          base: { ref: 'main' },
          head: { ref: 'feature/login' },
          created_at: '2026-04-01T10:00:00Z',
        },
      }),
    listFiles: () =>
      Promise.resolve({
        data: [{ filename: 'src/login.ts', status: 'added', additions: 50, deletions: 0 }],
      }),
    listReviewComments: () => Promise.resolve({ data: [{ user: { login: 'bob' }, body: 'looks good' }] }),
  },
} as unknown as GithubAdapter

describe('buildShellAction (foundation: get_pull_request)', () => {
  beforeEach(() => {
    setGithubAdapter(fakeAdapter)
    setRepoMonitoredCheck(async () => true)
  })
  afterEach(() => {
    // Each test re-installs the adapter; nothing to tear down on the registry side.
  })

  test('returns exit code 0 when given valid flags and writes result to stdout sink', async () => {
    const out: string[] = []
    const action = buildShellAction(getPullRequestOperation, {
      writeStdout: (line) => out.push(line),
      writeStderr: () => {},
    })

    const exit = await action(['--owner', 'Athrean', '--repo', 'Orchentra', '--number', '7'])
    expect(exit).toBe(0)
    const joined = out.join('\n')
    expect(joined).toContain('Add login flow')
  })

  test('returns exit code 1 and writes invalid_input message to stderr when required flag missing', async () => {
    const errs: string[] = []
    const action = buildShellAction(getPullRequestOperation, {
      writeStdout: () => {},
      writeStderr: (line) => errs.push(line),
    })

    const exit = await action(['--owner', 'Athrean', '--repo', 'Orchentra'])
    expect(exit).toBe(1)
    expect(errs.join('\n').toLowerCase()).toContain('number')
  })

  test('slash handler invokes the same op handler when given key=value args', async () => {
    const out: string[] = []
    const handler = buildSlashHandlerArgs(getPullRequestOperation, {
      writeStdout: (line) => out.push(line),
      writeStderr: () => {},
    })

    const exit = await handler(['owner=Athrean', 'repo=Orchentra', 'number=7'])
    expect(exit).toBe(0)
    expect(out.join('\n')).toContain('Add login flow')
  })
})

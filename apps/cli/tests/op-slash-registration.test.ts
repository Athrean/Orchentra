import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  getPullRequestOperation,
  setGithubAdapter,
  setRepoMonitoredCheck,
  type GithubAdapter,
} from '@orchentra/operations'
import { CommandRegistry, type CommandContext } from '../src/commands/registry'
import { registerOpAsSlash } from '../src/op-commands/wire'
import type { UiOutput } from '../src/commands/ui-output'

describe('registerOpAsSlash (foundation: get_pull_request)', () => {
  beforeAll(() => {
    setGithubAdapter({
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
    } as unknown as GithubAdapter)
    setRepoMonitoredCheck(async () => true)
  })
  afterAll(() => {
    /* nothing to tear down */
  })

  test('registers /get_pull_request and routes through the same handler as the shell verb', async () => {
    const registry = new CommandRegistry()
    registerOpAsSlash(registry, getPullRequestOperation)

    const resolved = registry.resolve('/get_pull_request owner=Athrean repo=Orchentra number=7')
    expect(resolved).not.toBeNull()
    expect(resolved).not.toBeInstanceOf(Error)
    if (!resolved || resolved instanceof Error) return

    const captured: UiOutput[] = []
    const ctx: CommandContext = {
      cwd: process.cwd(),
      session: {} as CommandContext['session'],
      ui: (out) => captured.push(out),
    }

    const ok = await resolved.handler.execute(resolved.args, ctx)
    expect(ok).toBe(true)

    const text = captured
      .filter((o): o is Extract<UiOutput, { kind: 'text' }> => o.kind === 'text')
      .map((o) => o.text)
      .join('\n')
    expect(text).toContain('Add login flow')
  })

  test('routes parameter validation errors through the ui sink', async () => {
    const registry = new CommandRegistry()
    registerOpAsSlash(registry, getPullRequestOperation)

    const resolved = registry.resolve('/get_pull_request owner=Athrean repo=Orchentra')
    if (!resolved || resolved instanceof Error) {
      throw new Error('expected resolution')
    }

    const captured: UiOutput[] = []
    const ctx: CommandContext = {
      cwd: process.cwd(),
      session: {} as CommandContext['session'],
      ui: (out) => captured.push(out),
    }

    const ok = await resolved.handler.execute(resolved.args, ctx)
    expect(ok).toBe(false)

    const note = captured
      .filter((o): o is Extract<UiOutput, { kind: 'note' }> => o.kind === 'note')
      .map((o) => o.text)
      .join('\n')
    expect(note.toLowerCase()).toContain('number')
  })
})

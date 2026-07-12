import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Provider, ProviderStreamEvent, SharedToolState } from '@orchentra/cli-core'
import { DefaultToolRegistry } from '@orchentra/cli-tools'
import { LiveCli, type ModelResolver } from '../src/live-cli'
import { runOneShot } from '../src/one-shot'

function okProvider(): Provider {
  return {
    async *stream(): AsyncGenerator<ProviderStreamEvent> {
      yield { kind: 'text-delta', delta: 'done' }
      yield { kind: 'finish', stopReason: 'end_turn' }
    },
  }
}

function failingProvider(): Provider {
  return {
    // eslint-disable-next-line require-yield
    async *stream(): AsyncGenerator<ProviderStreamEvent> {
      throw new Error('provider unavailable')
    },
  }
}

function sharedState(): SharedToolState {
  return {
    taskStore: {
      create: () => {
        throw new Error('not used')
      },
      get: () => undefined,
      list: () => [],
      update: () => {},
      cancel: () => {},
    },
    todos: [],
    agentCounter: 0,
    planMode: false,
  }
}

function makeCli(provider: Provider, cwd: string): LiveCli {
  const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
  return new LiveCli({
    model: 'test-model',
    permissionMode: 'workspace-write',
    provider,
    resolveModel,
    tools: new DefaultToolRegistry(),
    cwd,
    sessionId: 'one-shot-test',
    sharedState: sharedState(),
  })
}

describe('one-shot exit codes', () => {
  test('a failed one-shot run exits non-zero', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-one-shot-fail-'))
    try {
      const cli = makeCli(failingProvider(), dir)
      let closed = false
      const code = await runOneShot(cli, 'do something', async () => {
        closed = true
      })
      expect(code).toBe(1)
      expect(closed).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a successful one-shot run exits zero', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-one-shot-ok-'))
    try {
      const cli = makeCli(okProvider(), dir)
      let closed = false
      const code = await runOneShot(cli, 'do something', async () => {
        closed = true
      })
      expect(code).toBe(0)
      expect(closed).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('runTurn reports the runtime done reason', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-one-shot-reason-'))
    try {
      const failed = await makeCli(failingProvider(), dir).runTurn('x')
      expect(failed).toEqual({ ok: false, reason: 'error' })
      const succeeded = await makeCli(okProvider(), dir).runTurn('x')
      expect(succeeded).toEqual({ ok: true, reason: 'stop' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

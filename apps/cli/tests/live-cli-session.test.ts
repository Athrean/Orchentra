import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Provider, ProviderStreamEvent, SharedToolState } from '@orchentra/cli-core'
import { SessionWriter } from '@orchentra/cli-core'
import { DefaultToolRegistry } from '@orchentra/cli-tools'
import { LiveCli, type ModelResolver } from '../src/live-cli'

function fakeProvider(): Provider {
  return {
    async *stream(): AsyncGenerator<ProviderStreamEvent> {
      yield { kind: 'finish', stopReason: 'end_turn' }
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

describe('LiveCli sessions', () => {
  test('startNewSession clears context and rotates to a fresh session file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-live-session-'))
    try {
      const provider = fakeProvider()
      const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
      const cli = new LiveCli({
        model: 'test-model',
        permissionMode: 'workspace-write',
        provider,
        resolveModel,
        tools: new DefaultToolRegistry(),
        cwd: dir,
        sessionId: 'old-session',
        sharedState: sharedState(),
      })
      const writer = await SessionWriter.open({
        rootDir: dir,
        id: 'old-session',
        meta: { cwd: dir, model: 'test-model' },
      })
      await writer.append({ kind: 'text', delta: 'old turn' })
      cli.setSession(writer)

      await cli.startNewSession()
      const nextId = cli.getSessionId()
      await cli.persistSession()

      expect(nextId).not.toBe('old-session')
      expect(existsSync(join(dir, 'old-session.jsonl'))).toBe(true)
      expect(existsSync(join(dir, `${nextId}.jsonl`))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

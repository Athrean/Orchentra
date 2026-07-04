import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Provider, ProviderRequest, ProviderStreamEvent, SharedToolState } from '@orchentra/cli-core'
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

function scriptedProvider(turns: ProviderStreamEvent[][]): Provider {
  let i = 0
  return {
    async *stream(_request: ProviderRequest): AsyncGenerator<ProviderStreamEvent> {
      const turn = turns[i++] ?? []
      for (const event of turn) yield event
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

  test('undoLastFileEdits removes files created by the previous agent turn', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-live-undo-create-'))
    try {
      const target = join(dir, 'created.txt')
      const provider = scriptedProvider([
        [
          {
            kind: 'tool-use',
            call: { id: 'write-1', name: 'write_file', input: { path: 'created.txt', content: 'new content' } },
          },
          { kind: 'finish', stopReason: 'tool_use' },
        ],
        [{ kind: 'finish', stopReason: 'end_turn' }],
      ])
      const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
      const cli = new LiveCli({
        model: 'test-model',
        permissionMode: 'workspace-write',
        provider,
        resolveModel,
        tools: new DefaultToolRegistry(),
        cwd: dir,
        sessionId: 'undo-session',
        sharedState: sharedState(),
      })
      cli.setEventSink(() => {})
      cli.setAskToolUser(async () => 'allow-once')

      await cli.runTurn('create a file')
      expect(readFileSync(target, 'utf8')).toBe('new content')

      const result = await cli.undoLastFileEdits()

      expect(result.kind).toBe('applied')
      if (result.kind === 'applied') {
        expect(result.files).toEqual([{ path: target, action: 'deleted' }])
      }
      expect(existsSync(target)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('undoLastFileEdits restores files edited by the previous agent turn', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-live-undo-edit-'))
    try {
      const target = join(dir, 'existing.txt')
      writeFileSync(target, 'before\n')
      const provider = scriptedProvider([
        [
          {
            kind: 'tool-use',
            call: {
              id: 'edit-1',
              name: 'edit_file',
              input: { path: 'existing.txt', old_string: 'before', new_string: 'after' },
            },
          },
          { kind: 'finish', stopReason: 'tool_use' },
        ],
        [{ kind: 'finish', stopReason: 'end_turn' }],
      ])
      const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
      const cli = new LiveCli({
        model: 'test-model',
        permissionMode: 'workspace-write',
        provider,
        resolveModel,
        tools: new DefaultToolRegistry(),
        cwd: dir,
        sessionId: 'undo-session',
        sharedState: sharedState(),
      })
      cli.setEventSink(() => {})
      cli.setAskToolUser(async () => 'allow-once')

      await cli.runTurn('edit a file')
      expect(readFileSync(target, 'utf8')).toBe('after\n')

      const result = await cli.undoLastFileEdits()

      expect(result.kind).toBe('applied')
      expect(readFileSync(target, 'utf8')).toBe('before\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

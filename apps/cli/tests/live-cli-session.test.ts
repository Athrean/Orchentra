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

  test('runTurn records user messages in the session log for future resume', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-live-user-log-'))
    try {
      const provider = scriptedProvider([
        [
          { kind: 'text-delta', delta: 'hello back' },
          { kind: 'finish', stopReason: 'end_turn' },
        ],
      ])
      const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
      const cli = new LiveCli({
        model: 'test-model',
        permissionMode: 'workspace-write',
        provider,
        resolveModel,
        tools: new DefaultToolRegistry(),
        cwd: dir,
        sessionId: 'user-log-session',
        sharedState: sharedState(),
      })
      const writer = await SessionWriter.open({
        rootDir: dir,
        id: 'user-log-session',
        meta: { cwd: dir, model: 'test-model' },
      })
      cli.setSession(writer)
      cli.setEventSink(() => {})

      await cli.runTurn('remember this prompt')
      await cli.persistSession()

      const raw = readFileSync(join(dir, 'user-log-session.jsonl'), 'utf8')
      expect(raw).toContain('"kind":"user_message"')
      expect(raw).toContain('"content":"remember this prompt"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('resumeSession hydrates prior messages and appends to the resumed file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-live-resume-'))
    try {
      writeFileSync(
        join(dir, 'old-session.jsonl'),
        [
          JSON.stringify({
            meta: { id: 'old-session', createdAt: '2026-07-04T00:00:00.000Z', cwd: dir, model: 'test-model' },
            event: { kind: 'user_message', content: 'first prompt' },
            at: '2026-07-04T00:00:00.000Z',
          }),
          JSON.stringify({
            meta: { id: 'old-session', createdAt: '2026-07-04T00:00:00.000Z', cwd: dir, model: 'test-model' },
            event: { kind: 'text', delta: 'first answer' },
            at: '2026-07-04T00:00:01.000Z',
          }),
          JSON.stringify({
            meta: { id: 'old-session', createdAt: '2026-07-04T00:00:00.000Z', cwd: dir, model: 'test-model' },
            event: {
              kind: 'usage',
              step: 1,
              turn: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0 },
              cumulative: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0 },
            },
            at: '2026-07-04T00:00:02.000Z',
          }),
        ].join('\n') + '\n',
      )

      let seenRequest: ProviderRequest | null = null
      const provider: Provider = {
        async *stream(request: ProviderRequest): AsyncGenerator<ProviderStreamEvent> {
          seenRequest = request
          yield { kind: 'finish', stopReason: 'end_turn' }
        },
      }
      const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
      const cli = new LiveCli({
        model: 'test-model',
        permissionMode: 'workspace-write',
        provider,
        resolveModel,
        tools: new DefaultToolRegistry(),
        cwd: dir,
        sessionId: 'new-session',
        sharedState: sharedState(),
      })
      const writer = await SessionWriter.open({
        rootDir: dir,
        id: 'new-session',
        meta: { cwd: dir, model: 'test-model' },
      })
      cli.setSession(writer)
      cli.setEventSink(() => {})

      const result = await cli.resumeSession(join(dir, 'old-session.jsonl'))

      expect(result.sessionId).toBe('old-session')
      expect(result.contextComplete).toBe(true)
      expect(cli.getSessionId()).toBe('old-session')
      expect(cli.getTurns()).toBe(1)

      await cli.runTurn('continue')
      await cli.persistSession()

      expect(seenRequest?.messages).toEqual([
        { role: 'user', content: 'first prompt' },
        { role: 'assistant', content: 'first answer', toolCalls: undefined },
        { role: 'user', content: 'continue' },
      ])
      const raw = readFileSync(join(dir, 'old-session.jsonl'), 'utf8')
      expect(raw).toContain('"content":"continue"')
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

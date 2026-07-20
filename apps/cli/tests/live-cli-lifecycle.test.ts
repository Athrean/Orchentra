import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LifecycleHookEvent, Provider, ProviderStreamEvent, SharedToolState } from '@orchentra/cli-core'
import { HookRunner, SessionWriter } from '@orchentra/cli-core'
import { DefaultToolRegistry } from '@orchentra/cli-tools'
import { LiveCli, type ModelResolver } from '../src/live-cli'

/** Records lifecycle fires; no-op for tool hooks (inherited base behavior). */
class RecordingHookRunner extends HookRunner {
  readonly lifecycle: Array<{ event: LifecycleHookEvent; payload: Record<string, unknown> }> = []
  override async runLifecycle(event: LifecycleHookEvent, payload: Record<string, unknown> = {}): Promise<void> {
    this.lifecycle.push({ event, payload })
  }
  events(): LifecycleHookEvent[] {
    return this.lifecycle.map((c) => c.event)
  }
}

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

function makeCli(cwd: string, hookRunner: RecordingHookRunner): LiveCli {
  const provider = fakeProvider()
  const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
  const cli = new LiveCli({
    model: 'test-model',
    permissionMode: 'workspace-write',
    provider,
    resolveModel,
    tools: new DefaultToolRegistry(),
    cwd,
    sessionId: 'sess-1',
    sharedState: sharedState(),
    hookRunner,
  })
  cli.setEventSink(() => {}) // route events through the sink, silencing stdout
  return cli
}

describe('LiveCli lifecycle hooks', () => {
  test('SessionStart fires once, on the first turn only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-lc-lifecycle-'))
    try {
      const runner = new RecordingHookRunner()
      const cli = makeCli(dir, runner)
      await cli.runTurn('hello')
      await cli.runTurn('again')
      expect(runner.events().filter((e) => e === 'SessionStart')).toEqual(['SessionStart'])
      expect(runner.lifecycle[0].payload.sessionId).toBe('sess-1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a compaction fires PreCompact then PostCompact with the same stats', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-lc-lifecycle-'))
    try {
      const runner = new RecordingHookRunner()
      const cli = makeCli(dir, runner)
      await (cli as unknown as { handleEvent(e: unknown): Promise<void> }).handleEvent({
        kind: 'compacted',
        droppedMessageCount: 4,
        tokensSaved: 250,
        summary: 'digest',
      })
      expect(runner.events()).toEqual(['PreCompact', 'PostCompact'])
      expect(runner.lifecycle[0].payload).toEqual({ droppedMessageCount: 4, tokensSaved: 250 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an agent tool_use/tool_result pair fires SubagentStart then SubagentStop', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-lc-lifecycle-'))
    try {
      const runner = new RecordingHookRunner()
      const cli = makeCli(dir, runner)
      const handle = (e: unknown): Promise<void> =>
        (cli as unknown as { handleEvent(e: unknown): Promise<void> }).handleEvent(e)
      await handle({ kind: 'tool_use', call: { id: 'a1', name: 'agent', input: {} } })
      await handle({ kind: 'tool_result', result: { id: 'a1', content: 'done', isError: false } })
      expect(runner.events()).toEqual(['SubagentStart', 'SubagentStop'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a non-agent tool call fires no sub-agent lifecycle hooks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-lc-lifecycle-'))
    try {
      const runner = new RecordingHookRunner()
      const cli = makeCli(dir, runner)
      const handle = (e: unknown): Promise<void> =>
        (cli as unknown as { handleEvent(e: unknown): Promise<void> }).handleEvent(e)
      await handle({ kind: 'tool_use', call: { id: 'b1', name: 'bash', input: { command: 'ls' } } })
      await handle({ kind: 'tool_result', result: { id: 'b1', content: 'ok', isError: false } })
      expect(runner.events()).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('SessionEnd fires when the session is persisted (closed)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-lc-lifecycle-'))
    try {
      const runner = new RecordingHookRunner()
      const cli = makeCli(dir, runner)
      cli.setSession(await SessionWriter.open({ rootDir: dir, meta: { cwd: dir, model: 'test-model' } }))
      await cli.persistSession()
      expect(runner.events()).toContain('SessionEnd')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

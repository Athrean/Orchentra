import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  Provider,
  ProviderRequest,
  ProviderStreamEvent,
  SharedToolState,
  ToolRegistry,
  ToolResult,
} from '@orchentra/cli-core'
import { SessionWriter } from '@orchentra/cli-core'
import { LiveCli, type ModelResolver } from '../src/live-cli'

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

function verificationTools(): ToolRegistry {
  return {
    list: () => [{ name: 'bash', description: 'verify', inputSchema: { type: 'object' } }],
    has: (name) => name === 'bash',
    register: () => {},
    execute: async (): Promise<ToolResult> => ({
      content: 'exit code 0',
      isError: false,
      evidence: [{ kind: 'exit-status', summary: 'exit code 0', detail: { command: 'bun test', exitCode: 0 } }],
    }),
  }
}

function makeCli(provider: Provider, cwd: string, sessionId: string): LiveCli {
  const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
  const cli = new LiveCli({
    model: 'test-model',
    permissionMode: 'allow',
    provider,
    resolveModel,
    tools: verificationTools(),
    cwd,
    sessionId,
    sharedState: sharedState(),
  })
  cli.setEventSink(() => {})
  cli.setAskToolUser(async () => 'allow-once')
  return cli
}

function interruptedProvider(): { provider: Provider; waitForSecondTurn(): Promise<void>; release(): void } {
  let first = true
  let secondStarted!: () => void
  let release!: () => void
  const second = new Promise<void>((resolve) => {
    secondStarted = resolve
  })
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    provider: {
      async *stream(_request: ProviderRequest): AsyncGenerator<ProviderStreamEvent> {
        if (first) {
          first = false
          yield { kind: 'tool-use', call: { id: 'verify-before-kill', name: 'bash', input: { command: 'bun test' } } }
          yield { kind: 'finish', stopReason: 'tool_use' }
          return
        }
        secondStarted()
        await hold
        yield { kind: 'finish', stopReason: 'end_turn' }
      },
    },
    waitForSecondTurn: () => second,
    release,
  }
}

/** Parent and each pool reviewer first runs evidence, then ends the turn. */
function completingProvider(): Provider {
  let sequence = 0
  return {
    async *stream(request: ProviderRequest): AsyncGenerator<ProviderStreamEvent> {
      if (!request.messages.some((message) => message.role === 'tool')) {
        sequence++
        yield {
          kind: 'tool-use',
          call: { id: `resume-verify-${sequence}`, name: 'bash', input: { command: 'bun test' } },
        }
        yield { kind: 'finish', stopReason: 'tool_use' }
        return
      }
      yield { kind: 'finish', stopReason: 'end_turn' }
    },
  }
}

describe('M4 autonomous resume', () => {
  test('an interrupted EXECUTE session restores RunState and completes OBSERVE → ASSERT → GATE', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-m4-resume-'))
    try {
      const interrupted = interruptedProvider()
      const first = makeCli(interrupted.provider, dir, 'interrupted')
      const writer = await SessionWriter.open({
        rootDir: dir,
        id: 'interrupted',
        meta: { cwd: dir, model: 'test-model' },
      })
      first.setSession(writer)

      const running = first.runTurn('fix interrupted task', { verify: true })
      await interrupted.waitForSecondTurn()
      first.abort()
      interrupted.release()
      expect((await running).reason).toBe('aborted')
      await first.persistSession()

      const resumed = makeCli(completingProvider(), dir, 'new')
      const restored = await resumed.resumeSession(join(dir, 'interrupted.jsonl'))
      expect(restored.contextComplete).toBe(true)
      const result = await resumed.resumeAutonomousRun()
      expect(result).toEqual({ ok: true, reason: 'stop' })
      await resumed.persistSession()

      const raw = readFileSync(join(dir, 'interrupted.jsonl'), 'utf8')
      expect(raw).toContain('"kind":"run_state"')
      expect(raw).toContain('"state":"GATE"')
      expect(raw).toContain('"state":"DONE"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

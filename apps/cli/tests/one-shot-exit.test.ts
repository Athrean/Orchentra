import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  PermissionMode,
  Provider,
  ProviderStreamEvent,
  SharedToolState,
  ToolRegistry,
  ToolResult,
} from '@orchentra/cli-core'
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

/** Main run + each reviewer replay run `bash` once, then cleanly end. */
function gatePassingProvider(): Provider {
  let calls = 0
  return {
    async *stream(request): AsyncGenerator<ProviderStreamEvent> {
      const hasToolResult = request.messages.some((message) => message.role === 'tool')
      if (!hasToolResult) {
        calls++
        yield { kind: 'tool-use', call: { id: `verify-${calls}`, name: 'bash', input: { command: 'bun test' } } }
        yield { kind: 'finish', stopReason: 'tool_use' }
        return
      }
      yield { kind: 'text-delta', delta: 'verified' }
      yield { kind: 'finish', stopReason: 'end_turn' }
    },
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

function makeCli(
  provider: Provider,
  cwd: string,
  tools: ToolRegistry = new DefaultToolRegistry(),
  permissionMode: PermissionMode = 'workspace-write',
): LiveCli {
  const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
  return new LiveCli({
    model: 'test-model',
    permissionMode,
    provider,
    resolveModel,
    tools,
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

  test('one-shot exits zero only after parent evidence and all three reviewer replays pass', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-one-shot-ok-'))
    try {
      const cli = makeCli(gatePassingProvider(), dir, verificationTools(), 'allow')
      cli.setAskToolUser(async () => 'allow-once')
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

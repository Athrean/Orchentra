import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Provider, ProviderStreamEvent, RuntimeEvent, SharedToolState } from '@orchentra/cli-core'
import { DefaultToolRegistry } from '@orchentra/cli-tools'
import { LiveCli, type ModelResolver } from '../src/live-cli'
import type { AskUser, PromptRequest } from '@orchentra/cli-core'

function fakeProvider(responses: ProviderStreamEvent[][]): Provider {
  let callIndex = 0
  return {
    async *stream() {
      const resp = responses[callIndex++] ?? []
      for (const ev of resp) yield ev
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

describe('LiveCli permissions', () => {
  test('passes registry-derived tool requirements into the runtime enforcer', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-live-perms-'))
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'web_search', input: { query: 'orchentra' } } },
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
      cwd,
      sessionId: 'test-session',
      sharedState: sharedState(),
    })

    const events: RuntimeEvent[] = []
    let prompt: PromptRequest | undefined
    cli.setEventSink((event) => {
      events.push(event)
    })
    cli.setAskToolUser((async (request) => {
      prompt = request
      return 'deny'
    }) as AskUser)

    await cli.runTurn('search the web')

    expect(prompt?.toolName).toBe('web_search')
    expect(prompt?.requiredMode).toBe('danger-full-access')
    expect(prompt?.currentMode).toBe('workspace-write')
    const result = events.find((event) => event.kind === 'tool_result')
    expect(result).toMatchObject({ kind: 'tool_result', result: { isError: true } })
  })
})

import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeEvent } from '@orchentra/cli-core'
import { DefaultToolRegistry } from '@orchentra/cli-tools'
import { LiveCli, type ModelResolver } from '../src/live-cli'
import type { AskUser, PromptRequest } from '@orchentra/cli-core'
import { scriptedProvider as fakeProvider, sharedState } from './support/provider'

describe('LiveCli permissions', () => {
  test('passes registry-derived tool requirements into the runtime enforcer', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-live-perms-'))
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'admin_probe', input: { url: 'https://example.com' } } },
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
      tools: new DefaultToolRegistry([
        {
          name: 'admin_probe',
          description: 'test permission escalation',
          level: 'admin',
          inputSchema: { type: 'object' },
          execute: async () => ({ content: 'ran', isError: false }),
        },
      ]),
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

    await cli.runTurn('fetch a page')

    expect(prompt?.toolName).toBe('admin_probe')
    expect(prompt?.requiredMode).toBe('danger-full-access')
    expect(prompt?.currentMode).toBe('workspace-write')
    const result = events.find((event) => event.kind === 'tool_result')
    expect(result).toMatchObject({ kind: 'tool_result', result: { isError: true } })
  })
})

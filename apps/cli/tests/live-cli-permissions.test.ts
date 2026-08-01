import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ParsedSkill, RuntimeEvent } from '@orchentra/cli-core'
import { DefaultToolRegistry } from '@orchentra/cli-tools'
import { LiveCli, type ModelResolver } from '../src/live-cli'
import type { AskUser, PromptRequest } from '@orchentra/cli-core'
import { CommandRegistry } from '../src/commands/registry'
import { registerSkillCommands } from '../src/commands/builtin/skills-adapter'
import { scriptedProvider as fakeProvider, sharedState } from './support/provider'

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

  test('skill allowed-tools changes permission at the runtime boundary', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-skill-perms-'))
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'deploy', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [{ kind: 'finish', stopReason: 'end_turn' }],
    ])
    let executions = 0
    const tools = new DefaultToolRegistry([
      {
        name: 'deploy',
        description: 'deploy',
        level: 'admin',
        inputSchema: { type: 'object' },
        execute: async () => {
          executions++
          return { content: 'deployed', isError: false }
        },
      },
    ])
    const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
    const cli = new LiveCli({
      model: 'test-model',
      permissionMode: 'danger-full-access',
      provider,
      resolveModel,
      tools,
      cwd,
      sessionId: 'test-session',
      sharedState: sharedState(),
    })
    let prompted = false
    cli.setAskToolUser(async () => {
      prompted = true
      return 'deny'
    })

    const registry = new CommandRegistry()
    const skill: ParsedSkill = {
      name: 'release',
      description: 'release',
      body: 'Deploy the release.',
      source: '/tmp/release/SKILL.md',
      allowedTools: ['deploy'],
      argumentNames: [],
      meta: { name: 'release', description: 'release' },
    }
    registerSkillCommands(registry, [skill], {
      runTurn: async (text, options) => {
        await cli.runTurn(text, options)
      },
    })
    const resolved = registry.resolve('/release')
    if (resolved === null || resolved instanceof Error) throw new Error('expected skill handler')

    await resolved.handler.execute([], { cwd, session: {} as never })

    expect(executions).toBe(1)
    expect(prompted).toBe(false)
  })
})

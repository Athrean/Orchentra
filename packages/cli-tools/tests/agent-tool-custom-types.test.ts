import { describe, expect, test } from 'bun:test'
import type { Provider, ProviderRequest, ProviderStreamEvent, ToolContext, ToolRegistry } from '@orchentra/cli-core'
import { createAgentTool } from '../src/tools/agent-tool'
import { BUILTIN_ROLES } from '../src/tools/subagent-roles'
import { mergeAgentRoles } from '../src/tools/agent-definitions'

function capturingProvider(captured: ProviderRequest[]): Provider {
  return {
    async *stream(req: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      captured.push(req)
      yield { kind: 'text-delta', delta: 'done' }
      yield { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } }
      yield { kind: 'finish', stopReason: 'end_turn' }
    },
  }
}

function leveledRegistry(): ToolRegistry {
  const entries: Record<string, 'read-only' | 'workspace-write' | 'danger-full-access'> = {
    read_file: 'read-only',
    grep_search: 'read-only',
    write_file: 'workspace-write',
    bash: 'danger-full-access',
  }
  return {
    list: () =>
      Object.keys(entries).map((name) => ({ name, description: name, inputSchema: { type: 'object' as const } })),
    requirements: () => entries,
    has: (name) => name in entries,
    execute: async (name) => ({ content: `ran:${name}`, isError: false }),
    register: () => {},
  }
}

function baseCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: 'test',
    cwd: '/tmp',
    model: 'test-model',
    provider: capturingProvider([]),
    tools: leveledRegistry(),
    ...overrides,
  }
}

function agentTypeEnum(tool: ReturnType<typeof createAgentTool>): string[] {
  const schema = tool.inputSchema as {
    properties: { agentType: { enum: string[] } }
  }
  return schema.properties.agentType.enum
}

describe('createAgentTool schema enum', () => {
  test('built-in factory exposes all four roles, including browser-tester', () => {
    const enumValues = agentTypeEnum(createAgentTool(BUILTIN_ROLES)).sort()
    expect(enumValues).toEqual(['browser-tester', 'builder', 'explorer', 'reviewer'])
  })

  test('a discovered custom role is selectable through the schema enum', () => {
    const roles = mergeAgentRoles([
      { name: 'auditor', description: 'audits', tools: 'read-only', body: 'audit', source: 'a.md' },
    ])
    expect(agentTypeEnum(createAgentTool(roles))).toContain('auditor')
  })
})

describe('createAgentTool spawns custom types', () => {
  test('a project-local custom role runs with its own focus and capability cap', async () => {
    const captured: ProviderRequest[] = []
    const roles = mergeAgentRoles([
      {
        name: 'auditor',
        description: 'read-only security review',
        tools: 'read-only',
        body: 'You are the auditor sub-agent: read and report, never edit.',
        source: 'auditor.md',
      },
    ])
    const tool = createAgentTool(roles)
    const result = await tool.execute(
      { prompt: 'audit the login flow', agentType: 'auditor' },
      baseCtx({ provider: capturingProvider(captured) }),
    )
    expect(result.isError).toBe(false)
    // The custom role's body became the sub-agent's focus.
    expect(captured[0]!.systemStatic).toContain('auditor sub-agent')
    // read-only shorthand narrowed the advertised toolset.
    expect(captured[0]!.tools.map((t) => t.name).sort()).toEqual(['grep_search', 'read_file'])
  })

  test('an unknown agentType still errors, listing the merged role names', async () => {
    const roles = mergeAgentRoles([
      { name: 'auditor', description: 'audits', tools: 'read-only', body: 'audit', source: 'a.md' },
    ])
    const result = await createAgentTool(roles).execute({ prompt: 'x', agentType: 'ninja' }, baseCtx())
    expect(result.isError).toBe(true)
    expect(result.content).toContain('ninja')
    expect(result.content).toContain('auditor')
  })
})

describe('createAgentTool config-driven caps', () => {
  test('a maxDepth override refuses a spawn the default would allow', async () => {
    const tool = createAgentTool(BUILTIN_ROLES, { maxDepth: 1 })
    // Default cap is 2, so depth 1 would normally spawn; the override forbids it.
    const result = await tool.execute({ prompt: 'x' }, baseCtx({ subagentDepth: 1 }))
    expect(result.isError).toBe(true)
    expect(result.content).toContain('depth')
  })

  test('undefined caps fall back to the built-in defaults (depth 2)', async () => {
    const tool = createAgentTool(BUILTIN_ROLES, {})
    const result = await tool.execute({ prompt: 'x' }, baseCtx({ subagentDepth: 1 }))
    expect(result.isError).toBe(false)
  })
})

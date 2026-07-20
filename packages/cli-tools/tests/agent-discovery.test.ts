import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Provider, ProviderRequest, ProviderStreamEvent, ToolContext, ToolRegistry } from '@orchentra/cli-core'
import { discoverAgentDefinitions, mergeAgentRoles, resolveAgentRoles } from '../src/tools/agent-definitions'
import { createAgentTool } from '../src/tools/agent-tool'
import { resetActiveRolesForTests } from '../src/tools/subagent-roles'

let root: string
let prevConfigHome: string | undefined
let userHome: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orchentra-agents-'))
  userHome = join(root, 'home')
  prevConfigHome = process.env.ORCHESTRA_CONFIG_HOME
  process.env.ORCHESTRA_CONFIG_HOME = userHome
})

afterEach(async () => {
  if (prevConfigHome === undefined) delete process.env.ORCHESTRA_CONFIG_HOME
  else process.env.ORCHESTRA_CONFIG_HOME = prevConfigHome
  resetActiveRolesForTests()
  await rm(root, { recursive: true, force: true })
})

async function writeAgent(dir: string, file: string, body: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, file), body)
}

describe('discoverAgentDefinitions', () => {
  test('finds a project-local definition with no code change', async () => {
    const cwd = join(root, 'proj')
    await writeAgent(
      join(cwd, '.orchentra', 'agents'),
      'auditor.md',
      `---
name: auditor
description: audits security
tools: read-only
---
Audit the delegated code.`,
    )
    const defs = await discoverAgentDefinitions(cwd)
    expect(defs.map((d) => d.name)).toContain('auditor')
  })

  test('reads a .claude/agents definition for cross-tool compatibility', async () => {
    const cwd = join(root, 'proj')
    await writeAgent(
      join(cwd, '.claude', 'agents'),
      'legacy.md',
      `---
name: legacy-helper
description: imported from another tool
tools: read-only
---
Help.`,
    )
    const defs = await discoverAgentDefinitions(cwd)
    expect(defs.map((d) => d.name)).toContain('legacy-helper')
  })

  test('project shadows user shadows .claude on a name collision', async () => {
    const cwd = join(root, 'proj')
    const mk = (where: string, desc: string): Promise<void> =>
      writeAgent(
        where,
        'shared.md',
        `---
name: shared
description: ${desc}
tools: read-only
---
body`,
      )
    await mk(join(cwd, '.claude', 'agents'), 'from-claude')
    await mk(join(userHome, 'agents'), 'from-user')
    await mk(join(cwd, '.orchentra', 'agents'), 'from-project')

    const merged = mergeAgentRoles(await discoverAgentDefinitions(cwd))
    expect(merged.shared!.description).toBe('from-project')
  })

  test('user-home definitions are found via the config home', async () => {
    const cwd = join(root, 'proj')
    await mkdir(cwd, { recursive: true })
    await writeAgent(
      join(userHome, 'agents'),
      'global.md',
      `---
name: global-agent
description: available across projects
tools: admin
---
Do global work.`,
    )
    const defs = await discoverAgentDefinitions(cwd)
    expect(defs.map((d) => d.name)).toContain('global-agent')
  })

  test('a malformed definition is skipped, valid siblings still load', async () => {
    const cwd = join(root, 'proj')
    const dir = join(cwd, '.orchentra', 'agents')
    await writeAgent(dir, 'good.md', `---\nname: good\ndescription: fine\ntools: read-only\n---\nok`)
    await writeAgent(dir, 'bad.md', `no frontmatter at all`)
    const defs = await discoverAgentDefinitions(cwd)
    expect(defs.map((d) => d.name)).toEqual(['good'])
  })
})

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
    write_file: 'workspace-write',
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

describe('end-to-end: a disk definition is spawnable with no code change', () => {
  test('resolveAgentRoles → createAgentTool spawns a project-local custom type by name', async () => {
    const cwd = join(root, 'proj')
    await writeAgent(
      join(cwd, '.orchentra', 'agents'),
      'doc-writer.md',
      `---
name: doc-writer
description: writes documentation
tools: read-only
---
You are the doc-writer sub-agent: read code and draft docs, never edit source.`,
    )

    const roles = await resolveAgentRoles(cwd)
    const captured: ProviderRequest[] = []
    const tool = createAgentTool(roles)
    const result = await tool.execute({ prompt: 'document the config loader', agentType: 'doc-writer' }, {
      sessionId: 't',
      cwd,
      model: 'test-model',
      provider: capturingProvider(captured),
      tools: leveledRegistry(),
    } as ToolContext)

    expect(result.isError).toBe(false)
    expect(captured[0]!.systemStatic).toContain('doc-writer sub-agent')
    // read-only cap from the file kept the write tool off the advertised set.
    expect(captured[0]!.tools.map((t) => t.name)).toEqual(['read_file'])
  })
})

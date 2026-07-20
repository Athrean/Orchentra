import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverAgentDefinitions, mergeAgentRoles } from '../src/tools/agent-definitions'

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

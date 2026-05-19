import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSkills } from '../src/runtime/skills/loader'

let workspaceRoot: string
let configHome: string
let cacheHome: string
let originalCacheHome: string | undefined

beforeEach(() => {
  workspaceRoot = mkdtempSync(join(tmpdir(), 'orchentra-skills-ws-'))
  configHome = mkdtempSync(join(tmpdir(), 'orchentra-skills-home-'))
  // Isolate the skill index file so these tests don't write to the real
  // `~/.config/orchentra/skills.idx` on the developer's box.
  cacheHome = mkdtempSync(join(tmpdir(), 'orchentra-skills-cache-'))
  originalCacheHome = process.env.ORCHENTRA_CONFIG_HOME
  process.env.ORCHENTRA_CONFIG_HOME = cacheHome
})

afterEach(() => {
  if (originalCacheHome === undefined) delete process.env.ORCHENTRA_CONFIG_HOME
  else process.env.ORCHENTRA_CONFIG_HOME = originalCacheHome
  rmSync(workspaceRoot, { recursive: true, force: true })
  rmSync(configHome, { recursive: true, force: true })
  rmSync(cacheHome, { recursive: true, force: true })
})

function writeSkill(name: string, content: string): void {
  const dir = join(workspaceRoot, '.orchentra', 'skills', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), content)
}

function writeUserSkill(name: string, content: string): void {
  const dir = join(configHome, 'skills', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), content)
}

describe('loadSkills', () => {
  test('returns empty arrays for an empty workspace', async () => {
    const result = await loadSkills({ workspaceRoot })
    expect(result.skills).toEqual([])
    expect(result.errors).toEqual([])
  })

  test('loads a single valid SKILL.md', async () => {
    writeSkill('hello', ['---', 'name: hello', 'description: say hi', '---', 'Hello, $ARGUMENTS!'].join('\n'))

    const result = await loadSkills({ workspaceRoot })
    expect(result.errors).toEqual([])
    expect(result.skills.length).toBe(1)
    expect(result.skills[0].name).toBe('hello')
    expect(result.skills[0].description).toBe('say hi')
    expect(result.skills[0].body.trim()).toBe('Hello, $ARGUMENTS!')
    expect(result.skills[0].source).toContain('hello/SKILL.md')
  })

  test('skips a SKILL.md missing required fields and emits a load error', async () => {
    writeSkill('broken', ['---', 'name: broken', '---', 'no description'].join('\n'))
    writeSkill('ok', ['---', 'name: ok', 'description: still loads', '---', 'body'].join('\n'))

    const result = await loadSkills({ workspaceRoot })
    expect(result.skills.length).toBe(1)
    expect(result.skills[0].name).toBe('ok')
    expect(result.errors.length).toBe(1)
    expect(result.errors[0].field).toBe('description')
    expect(result.errors[0].path).toContain('broken/SKILL.md')
  })

  test('reports a frontmatter parse error without aborting the rest', async () => {
    writeSkill('garbled', 'no frontmatter here at all')
    writeSkill('ok', ['---', 'name: ok', 'description: still loads', '---', 'body'].join('\n'))

    const result = await loadSkills({ workspaceRoot })
    expect(result.skills.map((s) => s.name)).toEqual(['ok'])
    expect(result.errors.length).toBe(1)
    expect(result.errors[0].path).toContain('garbled/SKILL.md')
  })

  test('loads skills from configHome alongside workspaceRoot', async () => {
    writeSkill('ws', ['---', 'name: ws', 'description: workspace skill', '---', 'b'].join('\n'))
    writeUserSkill('user', ['---', 'name: user', 'description: user skill', '---', 'b'].join('\n'))

    const result = await loadSkills({ workspaceRoot, configHome })
    const names = result.skills.map((s) => s.name).sort()
    expect(names).toEqual(['user', 'ws'])
    expect(result.errors).toEqual([])
  })

  test('workspace skill overrides user skill of the same name with a warning', async () => {
    writeSkill('deploy', ['---', 'name: deploy', 'description: workspace deploy', '---', 'ws'].join('\n'))
    writeUserSkill('deploy', ['---', 'name: deploy', 'description: user deploy', '---', 'user'].join('\n'))

    const result = await loadSkills({ workspaceRoot, configHome })
    expect(result.skills.length).toBe(1)
    expect(result.skills[0].description).toBe('workspace deploy')
    expect(result.errors.length).toBe(1)
    expect(result.errors[0].message).toContain('overrides')
  })
})

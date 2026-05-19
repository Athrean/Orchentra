import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSkills } from '../src/runtime/skills/loader'
import { skillsCachePath } from '../src/runtime/skills/cache'

let workspaceRoot: string
let configHome: string
let originalConfigHome: string | undefined

function setupSkillsDir(): string {
  const dir = join(workspaceRoot, '.orchentra', 'skills')
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeSkill(name: string, content: string): string {
  const dir = setupSkillsDir()
  const skillDir = join(dir, name)
  mkdirSync(skillDir, { recursive: true })
  const path = join(skillDir, 'SKILL.md')
  writeFileSync(path, content)
  return path
}

const validSkill = (name: string): string =>
  ['---', `name: ${name}`, `description: ${name} skill`, '---', 'body'].join('\n')

beforeEach(() => {
  workspaceRoot = mkdtempSync(join(tmpdir(), 'orchentra-skills-cache-ws-'))
  configHome = mkdtempSync(join(tmpdir(), 'orchentra-skills-cache-home-'))
  originalConfigHome = process.env.ORCHENTRA_CONFIG_HOME
  process.env.ORCHENTRA_CONFIG_HOME = configHome
})

afterEach(() => {
  if (originalConfigHome === undefined) delete process.env.ORCHENTRA_CONFIG_HOME
  else process.env.ORCHENTRA_CONFIG_HOME = originalConfigHome
  rmSync(workspaceRoot, { recursive: true, force: true })
  rmSync(configHome, { recursive: true, force: true })
})

describe('skill loader cache', () => {
  test('cold cache: first call walks dir and writes the index file', async () => {
    writeSkill('hello', validSkill('hello'))

    const cacheFile = skillsCachePath()
    expect(existsSync(cacheFile)).toBe(false)

    const result = await loadSkills({ workspaceRoot })
    expect(result.skills.map((s) => s.name)).toEqual(['hello'])

    expect(existsSync(cacheFile)).toBe(true)
    const text = readFileSync(cacheFile, 'utf-8')
    const parsed = JSON.parse(text) as { version: number; entries: Record<string, unknown> }
    expect(parsed.version).toBe(1)
    expect(Object.keys(parsed.entries)).toHaveLength(1)
  })

  test('warm cache: second call reuses cached entries (cache file mtime unchanged)', async () => {
    writeSkill('hello', validSkill('hello'))

    await loadSkills({ workspaceRoot })
    const cacheMtimeAfterCold = statSync(skillsCachePath()).mtimeMs

    // A small delay so a write would produce a measurably different
    // mtime. (Bun on macOS resolves mtime to roughly the millisecond.)
    await new Promise((r) => setTimeout(r, 20))

    const second = await loadSkills({ workspaceRoot })
    expect(second.skills.map((s) => s.name)).toEqual(['hello'])

    // Cache file mtime stays put: a warm hit must not touch the index.
    expect(statSync(skillsCachePath()).mtimeMs).toBe(cacheMtimeAfterCold)
  })

  test('invalidation: touching a skill file forces a re-walk', async () => {
    const skillPath = writeSkill('hello', validSkill('hello'))

    await loadSkills({ workspaceRoot })

    // Mutate the file (new mtime + new content). The dir hash will flip.
    writeFileSync(skillPath, validSkill('hello').replace('body', 'updated body'))
    const fresh = statSync(skillPath)
    utimesSync(skillPath, fresh.atime, new Date(fresh.mtimeMs + 5000))

    const result = await loadSkills({ workspaceRoot })
    expect(result.skills[0].body.trim()).toBe('updated body')
  })

  test('invalidation: adding a new skill forces a re-walk', async () => {
    writeSkill('alpha', validSkill('alpha'))
    const first = await loadSkills({ workspaceRoot })
    expect(first.skills.map((s) => s.name).sort()).toEqual(['alpha'])

    writeSkill('beta', validSkill('beta'))
    const second = await loadSkills({ workspaceRoot })
    expect(second.skills.map((s) => s.name).sort()).toEqual(['alpha', 'beta'])
  })

  test('invalidation: removing a skill forces a re-walk', async () => {
    writeSkill('alpha', validSkill('alpha'))
    writeSkill('beta', validSkill('beta'))
    const first = await loadSkills({ workspaceRoot })
    expect(first.skills.map((s) => s.name).sort()).toEqual(['alpha', 'beta'])

    rmSync(join(workspaceRoot, '.orchentra', 'skills', 'beta'), { recursive: true })
    const second = await loadSkills({ workspaceRoot })
    expect(second.skills.map((s) => s.name)).toEqual(['alpha'])
  })

  test('cache file is created with 0600 mode', async () => {
    writeSkill('hello', validSkill('hello'))
    await loadSkills({ workspaceRoot })

    const stat = statSync(skillsCachePath())
    // mode bits — strip the file-type bits via & 0o777.
    expect(stat.mode & 0o777).toBe(0o600)
  })

  test('concurrent readers do not corrupt the index', async () => {
    writeSkill('hello', validSkill('hello'))

    // Two parallel loads against the same root. Both must complete with
    // the same skills, and the on-disk file must parse cleanly afterwards.
    const [a, b] = await Promise.all([loadSkills({ workspaceRoot }), loadSkills({ workspaceRoot })])
    expect(a.skills.map((s) => s.name)).toEqual(['hello'])
    expect(b.skills.map((s) => s.name)).toEqual(['hello'])

    const text = readFileSync(skillsCachePath(), 'utf-8')
    const parsed = JSON.parse(text) as { entries: Record<string, unknown> }
    expect(Object.keys(parsed.entries)).toHaveLength(1)
  })

  test('errors are not cached: a fixed broken skill loads on the next call', async () => {
    writeSkill('broken', '---\nname: broken\n---\nno description')

    const first = await loadSkills({ workspaceRoot })
    expect(first.errors).toHaveLength(1)
    expect(first.skills).toHaveLength(0)

    // Fix the skill — write valid frontmatter and bump mtime so the dir
    // hash changes (re-walk path).
    const skillPath = join(workspaceRoot, '.orchentra', 'skills', 'broken', 'SKILL.md')
    writeFileSync(skillPath, validSkill('broken'))
    utimesSync(skillPath, new Date(), new Date(Date.now() + 5000))

    const second = await loadSkills({ workspaceRoot })
    expect(second.errors).toHaveLength(0)
    expect(second.skills.map((s) => s.name)).toEqual(['broken'])
  })

  test('user and workspace roots are cached independently', async () => {
    // Workspace-only skill on first load.
    writeSkill('ws', validSkill('ws'))

    const userSkillsDir = join(configHome, 'skills', 'user-only')
    mkdirSync(userSkillsDir, { recursive: true })
    writeFileSync(join(userSkillsDir, 'SKILL.md'), validSkill('user-only'))

    const first = await loadSkills({ workspaceRoot, configHome })
    expect(first.skills.map((s) => s.name).sort()).toEqual(['user-only', 'ws'])

    // Adding a user skill must invalidate the user-root cache but reuse
    // the workspace cache. We verify by adding a user skill and observing
    // both still come back.
    const newUserSkill = join(configHome, 'skills', 'another')
    mkdirSync(newUserSkill, { recursive: true })
    writeFileSync(join(newUserSkill, 'SKILL.md'), validSkill('another'))

    const second = await loadSkills({ workspaceRoot, configHome })
    expect(second.skills.map((s) => s.name).sort()).toEqual(['another', 'user-only', 'ws'])
  })
})

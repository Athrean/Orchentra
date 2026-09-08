import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { userPaths } from '../../platform/paths'
import { discoverSkillFiles } from './discovery'
import { computeDirHash, readCached, writeCached } from './cache'
import { parseFrontmatter } from './frontmatter'
import { validateSkillFrontmatter } from './validator'
import type { LoadError, LoadSkillsOptions, LoadSkillsResult, ParsedSkill } from './types'

type SkillScope = 'workspace' | 'user' | 'interop'

interface DiscoveredRoot {
  path: string
  scope: SkillScope
}

/**
 * Skill trees other agent CLIs install into, relative to the home directory.
 * They hold the same SKILL.md format Orchentra parses, and a user who has
 * already installed a skill globally reasonably expects it to be available
 * here rather than having to keep a second copy in sync. Lowest precedence:
 * anything in Orchentra's own user or workspace tree shadows them silently.
 */
export const INTEROP_SKILL_ROOTS: readonly string[] = ['.claude/skills', '.codex/skills', '.agents/skills']

interface RootResult {
  skills: ParsedSkill[]
  errors: LoadError[]
}

export async function loadSkills(opts: LoadSkillsOptions): Promise<LoadSkillsResult> {
  // Lowest precedence first: a later root's skill replaces an earlier one of
  // the same name. Ordering the list this way is what makes precedence
  // readable — the previous sort-based version only worked because there
  // were exactly two roots.
  const home = opts.homeDir ?? homedir()
  const ordered: DiscoveredRoot[] = []
  if (opts.interop !== false) {
    for (const rel of INTEROP_SKILL_ROOTS) ordered.push({ path: join(home, rel), scope: 'interop' })
  }
  ordered.push({ path: join(home, '.orchentra', 'skills'), scope: 'user' })
  ordered.push({ path: join(opts.configHome ?? userPaths({ home }).config, 'skills'), scope: 'user' })
  if (opts.interop !== false) {
    for (const rel of INTEROP_SKILL_ROOTS) ordered.push({ path: join(opts.workspaceRoot, rel), scope: 'interop' })
  }
  for (const path of opts.extraRoots ?? []) ordered.push({ path, scope: 'user' })
  ordered.push({ path: join(opts.workspaceRoot, '.orchentra', 'skills'), scope: 'workspace' })

  const byName = new Map<string, { skill: ParsedSkill; scope: SkillScope }>()
  const errors: LoadError[] = []

  for (const root of ordered) {
    let result: RootResult
    try {
      result = opts.cache === false ? await walkRoot(root.path) : await loadRoot(root.path)
    } catch (error) {
      errors.push({ path: root.path, message: error instanceof Error ? error.message : String(error) })
      continue
    }
    errors.push(...result.errors)

    for (const skill of result.skills) {
      const existing = byName.get(skill.name)
      // Shadowing an interop skill is the expected case, not a problem worth
      // reporting; shadowing the user's own Orchentra skill is worth a note.
      if (existing && existing.scope === 'user' && root.scope === 'workspace') {
        errors.push({
          path: skill.source,
          message: `workspace skill '${skill.name}' overrides user skill at ${existing.skill.source}`,
        })
      }
      byName.set(skill.name, { skill, scope: root.scope })
    }
  }

  return { skills: Array.from(byName.values()).map((v) => v.skill), errors }
}

/**
 * Loads skills from one root, consulting the on-disk index cache first.
 * Cache hits skip the directory walk entirely; misses walk fresh, then
 * write the result back. Parse/validation errors are not cached — a future
 * fix to a broken skill must be visible on the next boot without needing
 * a manual cache flush.
 */
async function loadRoot(rootPath: string): Promise<RootResult> {
  const dirState = await computeDirHash(rootPath)
  if (dirState === null) return { skills: [], errors: [] }

  const cached = readCached(rootPath, dirState)
  if (cached !== null) return { skills: cached, errors: [] }

  const fresh = await walkRoot(rootPath)
  if (fresh.errors.length === 0) {
    try {
      writeCached(rootPath, dirState, fresh.skills)
    } catch {
      /* Cache is optional, including on read-only installs. */
    }
  }
  return fresh
}

async function walkRoot(rootPath: string): Promise<RootResult> {
  const skills: ParsedSkill[] = []
  const errors: LoadError[] = []

  for (const skillFile of await discoverSkillFiles(rootPath)) {
    if ((await stat(skillFile)).size > 256 * 1024) {
      errors.push({ path: skillFile, message: 'SKILL.md exceeds 256 KiB' })
      continue
    }
    const text = await readFile(skillFile, 'utf-8')
    const parsed = parseFrontmatter(text)
    if (parsed.kind === 'error') {
      errors.push({ path: skillFile, message: parsed.message })
      continue
    }

    const validated = validateSkillFrontmatter(parsed.meta)
    if (validated.kind === 'error') {
      errors.push({ path: skillFile, message: validated.message, field: validated.field })
      continue
    }

    skills.push({
      name: validated.value.name,
      description: validated.value.description,
      body: parsed.body,
      source: skillFile,
      allowedTools: validated.value.allowedTools,
      argumentNames: validated.value.argumentNames,
      meta: parsed.meta,
    })
  }

  return { skills, errors }
}

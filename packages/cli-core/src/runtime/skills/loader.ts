import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseFrontmatter } from './frontmatter'
import { validateSkillFrontmatter } from './validator'
import type { LoadError, LoadSkillsOptions, LoadSkillsResult, ParsedSkill } from './types'

interface DiscoveredRoot {
  path: string
  scope: 'workspace' | 'user'
}

export async function loadSkills(opts: LoadSkillsOptions): Promise<LoadSkillsResult> {
  const roots: DiscoveredRoot[] = [{ path: join(opts.workspaceRoot, '.orchentra', 'skills'), scope: 'workspace' }]
  if (opts.configHome) {
    roots.push({ path: join(opts.configHome, 'skills'), scope: 'user' })
  }

  // Read user first, then workspace; workspace overrides on collision.
  const ordered = [...roots].sort((a) => (a.scope === 'user' ? -1 : 1))

  const byName = new Map<string, { skill: ParsedSkill; scope: 'workspace' | 'user' }>()
  const errors: LoadError[] = []

  for (const root of ordered) {
    if (!(await dirExists(root.path))) continue

    for (const entry of await readdir(root.path, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const skillFile = join(root.path, entry.name, 'SKILL.md')
      if (!(await fileExists(skillFile))) continue

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

      const skill: ParsedSkill = {
        name: validated.value.name,
        description: validated.value.description,
        body: parsed.body,
        source: skillFile,
        allowedTools: validated.value.allowedTools,
        argumentNames: validated.value.argumentNames,
        disableModelInvocation: validated.value.disableModelInvocation,
        meta: parsed.meta,
      }

      const existing = byName.get(skill.name)
      if (existing && existing.scope === 'user' && root.scope === 'workspace') {
        errors.push({
          path: skillFile,
          message: `workspace skill '${skill.name}' overrides user skill at ${existing.skill.source}`,
        })
      } else if (existing && existing.scope === 'workspace' && root.scope === 'user') {
        // Workspace already won; ignore user duplicate silently.
        continue
      }
      byName.set(skill.name, { skill, scope: root.scope })
    }
  }

  return { skills: Array.from(byName.values()).map((v) => v.skill), errors }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isDirectory()
  } catch {
    return false
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile()
  } catch {
    return false
  }
}

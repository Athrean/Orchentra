import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseFrontmatter } from './frontmatter'
import type { LoadError, LoadSkillsOptions, LoadSkillsResult, ParsedSkill } from './types'

export async function loadSkills(opts: LoadSkillsOptions): Promise<LoadSkillsResult> {
  const skillsDir = join(opts.workspaceRoot, '.orchentra', 'skills')
  const exists = await dirExists(skillsDir)
  if (!exists) return { skills: [], errors: [] }

  const skills: ParsedSkill[] = []
  const errors: LoadError[] = []

  for (const entry of await readdir(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillFile = join(skillsDir, entry.name, 'SKILL.md')
    if (!(await fileExists(skillFile))) continue

    const text = await readFile(skillFile, 'utf-8')
    const parsed = parseFrontmatter(text)
    if (parsed.kind === 'error') {
      errors.push({ path: skillFile, message: parsed.message })
      continue
    }

    const name = typeof parsed.meta.name === 'string' ? parsed.meta.name : null
    const description = typeof parsed.meta.description === 'string' ? parsed.meta.description : null
    if (!name) {
      errors.push({ path: skillFile, message: 'missing required field: name', field: 'name' })
      continue
    }
    if (!description) {
      errors.push({ path: skillFile, message: 'missing required field: description', field: 'description' })
      continue
    }

    skills.push({ name, description, body: parsed.body, source: skillFile, meta: parsed.meta })
  }

  return { skills, errors }
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

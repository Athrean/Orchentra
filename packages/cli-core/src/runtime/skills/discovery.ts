import { readdir, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Deterministic recursive discovery, following linked installations once and stopping cycles. */
export async function discoverSkillFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const seen = new Set<string>()
  let visited = 0
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 10 || ++visited > 10_000) throw new Error('Skill tree exceeds discovery limit')
    let canonical: string
    try {
      canonical = await realpath(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    if (seen.has(canonical)) return
    seen.add(canonical)
    const entries = (await readdir(canonical, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    if (entries.some((entry) => entry.name === 'SKILL.md' && entry.isFile())) {
      files.push(join(canonical, 'SKILL.md'))
      return // References/scripts inside a skill are resources, not further installations.
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const path = join(canonical, entry.name)
      if (entry.isDirectory() || (entry.isSymbolicLink() && (await stat(path).catch(() => null))?.isDirectory()))
        await walk(path, depth + 1)
    }
  }
  await walk(root, 0)
  return files
}

import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { loadSkills } from '../runtime/skills/loader'
import { parseFrontmatter } from '../runtime/skills/frontmatter'
import { validateSkillFrontmatter } from '../runtime/skills/validator'
import { containedPath, type PluginManifest } from './manifest'

/** Validate contributed files before the registry can activate the snapshot. */
export async function validatePluginContents(root: string, manifest: PluginManifest): Promise<void> {
  const loaded = await loadSkills({
    workspaceRoot: join(root, '.empty'),
    homeDir: join(root, '.empty'),
    configHome: join(root, '.empty'),
    interop: false,
    cache: false,
    extraRoots: await Promise.all(manifest.skills.map((path) => containedPath(root, path))),
  })
  if (loaded.errors.length) throw new Error(loaded.errors.map((e) => e.message).join('; '))
  const names = new Set(loaded.skills.map((s) => s.name))
  for (const [kind, paths] of [
    ['command', manifest.commands],
    ['agent', manifest.agents],
  ] as const) {
    for (const path of paths) {
      const target = await containedPath(root, path)
      const files = (await stat(target)).isFile()
        ? [path]
        : (await readdir(target)).filter((name) => name.endsWith('.md')).map((name) => join(path, name))
      for (const file of files) {
        const actual = await containedPath(root, file)
        if ((await stat(actual)).size > 256 * 1024) throw new Error(`${kind} file exceeds 256 KiB: ${file}`)
        const parsed = parseFrontmatter(await readFile(actual, 'utf8'))
        if (parsed.kind === 'error') throw new Error(`${file}: ${parsed.message}`)
        const checked = validateSkillFrontmatter({
          ...(kind === 'command' ? { name: basename(file, '.md') } : {}),
          ...parsed.meta,
        })
        if (checked.kind === 'error') throw new Error(`${file}: ${checked.message}`)
        if (kind === 'command') {
          if (names.has(checked.value.name)) throw new Error(`Duplicate skill/command name: ${checked.value.name}`)
          names.add(checked.value.name)
        }
      }
    }
  }
  for (const [name, value] of Object.entries(manifest.mcp)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name) || !value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Invalid MCP server: ${name}`)
    const server = value as Record<string, unknown>
    if (server.transport === 'stdio') {
      if (typeof server.command !== 'string' || !server.command.trim())
        throw new Error(`MCP server ${name} requires command`)
      if (
        server.args !== undefined &&
        (!Array.isArray(server.args) || server.args.some((arg) => typeof arg !== 'string'))
      )
        throw new Error(`MCP server ${name} args must be strings`)
    } else if (server.transport === 'http') {
      if (typeof server.url !== 'string' || !/^https?:\/\//.test(server.url))
        throw new Error(`MCP server ${name} requires HTTP(S) url`)
    } else throw new Error(`MCP server ${name} requires transport stdio or http`)
  }
}

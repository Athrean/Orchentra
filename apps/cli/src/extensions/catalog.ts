import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  ExtensionStore,
  containedPath,
  loadSkills,
  parseFrontmatter,
  readPluginManifest,
  validateSkillFrontmatter,
  type ParsedSkill,
  type SkillLoadError,
} from '@orchentra/cli-core'
import { parseAgentDefinition, roleFromDefinition, parseMcpConfig, type SubagentRole } from '@orchentra/cli-tools'
import type { HookMatch } from '../hooks/types'

export interface ExtensionCatalog {
  skills: ParsedSkill[]
  agents: Record<string, SubagentRole>
  servers: Record<string, unknown>
  hooks: HookMatch[]
  errors: SkillLoadError[]
}
const quote = (value: string): string => "'" + value.split("'").join("'\\''") + "'"

async function markdownFiles(root: string, path: string): Promise<string[]> {
  const target = await containedPath(root, path)
  if ((await stat(target)).isFile()) return [target]
  const files: string[] = []
  for (const entry of (await readdir(target)).sort()) {
    if (entry.endsWith('.md')) files.push(await containedPath(root, join(path, entry)))
  }
  return files
}

export async function loadExtensionCatalog(cwd: string, store: ExtensionStore): Promise<ExtensionCatalog> {
  const output: ExtensionCatalog = { skills: [], agents: {}, servers: {}, hooks: [], errors: [] }
  const native = await loadSkills({ workspaceRoot: cwd })
  output.skills.push(...native.skills)
  output.errors.push(...native.errors)
  for (const entry of await store.list()) {
    if (!entry.enabled) continue
    const root = store.snapshot(entry)
    try {
      const isolated = {
        workspaceRoot: join(root, '.empty'),
        configHome: join(root, '.empty'),
        homeDir: join(root, '.empty'),
        interop: false,
      }
      if (entry.kind === 'skill') {
        const loaded = await loadSkills({ ...isolated, extraRoots: [root] })
        if (loaded.errors.length) throw new Error(loaded.errors.map((e) => e.message).join('; '))
        for (const skill of loaded.skills) {
          // An explicit workspace skill wins over a managed user installation.
          if (!output.skills.some((s) => s.name === skill.name)) output.skills.push(skill)
        }
        continue
      }
      const manifest = await readPluginManifest(root)
      const skills: ParsedSkill[] = []
      const agents: Record<string, SubagentRole> = {}
      const servers: Record<string, unknown> = {}
      const hooks: HookMatch[] = []
      const loaded = await loadSkills({
        ...isolated,
        extraRoots: await Promise.all(manifest.skills.map((path) => containedPath(root, path))),
      })
      if (loaded.errors.length) throw new Error(loaded.errors.map((e) => e.message).join('; '))
      skills.push(...loaded.skills.map((skill) => ({ ...skill, name: `${entry.name}:${skill.name}` })))
      for (const dir of manifest.commands) {
        for (const path of await markdownFiles(root, dir)) {
          if ((await stat(path)).size > 256 * 1024) throw new Error(`Command exceeds 256 KiB: ${path}`)
          const parsed = parseFrontmatter(await readFile(path, 'utf8'))
          if (parsed.kind === 'error') throw new Error(`${path}: ${parsed.message}`)
          const meta = { name: basename(path, '.md'), ...parsed.meta, 'disable-model-invocation': true }
          const checked = validateSkillFrontmatter(meta)
          if (checked.kind === 'error') throw new Error(`${path}: ${checked.message}`)
          skills.push({
            ...checked.value,
            name: `${entry.name}:${checked.value.name}`,
            body: parsed.body,
            source: path,
            meta,
          })
        }
      }
      if (new Set(skills.map((s) => s.name)).size !== skills.length)
        throw new Error('Plugin commands and skills have duplicate names')
      for (const dir of manifest.agents) {
        for (const path of await markdownFiles(root, dir)) {
          if ((await stat(path)).size > 256 * 1024) throw new Error(`Agent exceeds 256 KiB: ${path}`)
          const parsed = parseAgentDefinition(await readFile(path, 'utf8'), path)
          if (parsed.kind === 'error') throw new Error(parsed.message)
          const definition = { ...parsed.definition, name: `${entry.name}:${parsed.definition.name}` }
          agents[definition.name] = roleFromDefinition(definition)
        }
      }
      for (const [name, value] of Object.entries(manifest.mcp)) {
        // Only an explicit placeholder expands; it is never shell evaluated here.
        const expanded = expandRoot(value, root)
        servers[`plugin-${entry.name}-${name}`] = expanded
      }
      const parsedMcp = parseMcpConfig({ servers })
      if (parsedMcp.warnings.length) throw new Error(parsedMcp.warnings.join('; '))
      for (const event of ['PreToolUse', 'PostToolUse', 'PostToolUseFailure'] as const) {
        for (const command of manifest.hooks[event]) {
          hooks.push({
            event: event === 'PreToolUse' ? 'pre_tool_use' : 'post_tool_use',
            tools: ['*'],
            command: `cd ${quote(root)} && ${command}`,
            when: event === 'PostToolUseFailure' ? 'failure' : event === 'PostToolUse' ? 'success' : undefined,
          })
        }
      }
      output.skills.push(...skills)
      Object.assign(output.agents, agents)
      Object.assign(output.servers, servers)
      output.hooks.push(...hooks)
    } catch (error) {
      output.errors.push({
        path: root,
        message: `${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
  return output
}

function expandRoot(value: unknown, root: string): unknown {
  if (typeof value === 'string') return value.split('${PLUGIN_ROOT}').join(root)
  if (Array.isArray(value)) return value.map((entry) => expandRoot(entry, root))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, expandRoot(entry, root)]))
  return value
}

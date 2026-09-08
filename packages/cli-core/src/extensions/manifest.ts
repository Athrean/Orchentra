import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export interface PluginManifest {
  schemaVersion: 1
  name: string
  version: string
  description: string
  skills: string[]
  commands: string[]
  agents: string[]
  mcp: Record<string, unknown>
  hooks: { PreToolUse: string[]; PostToolUse: string[]; PostToolUseFailure: string[] }
}

export function validExtensionName(name: string): boolean {
  return /^[a-z][a-z0-9-]{0,63}$/.test(name)
}

function escapes(base: string, target: string): boolean {
  const rel = relative(base, target)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

export async function containedPath(root: string, path: string): Promise<string> {
  if (isAbsolute(path)) throw new Error(`Extension path must be relative: ${path}`)
  const base = await realpath(root)
  // Check the lexical path first: realpath on an escaping path that does not
  // exist reports ENOENT, which hides why the installation was refused.
  if (escapes(base, resolve(base, path))) throw new Error(`Extension path escapes installation: ${path}`)
  const target = await realpath(resolve(base, path))
  if (escapes(base, target)) throw new Error(`Extension path escapes installation: ${path}`)
  return target
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object`)
  return value as Record<string, unknown>
}
function strings(value: unknown, field: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim()))
    throw new Error(`${field} must be an array of nonempty strings`)
  return value as string[]
}

export async function readPluginManifest(root: string): Promise<PluginManifest> {
  const path = await containedPath(root, 'orchentra.plugin.json')
  if ((await stat(path)).size > 128 * 1024) throw new Error('Plugin manifest exceeds 128 KiB')
  const raw = object(JSON.parse(await readFile(path, 'utf8')), 'manifest')
  const fields = new Set([
    'schemaVersion',
    'name',
    'version',
    'description',
    'skills',
    'commands',
    'agents',
    'mcp',
    'hooks',
  ])
  for (const field of Object.keys(raw)) if (!fields.has(field)) throw new Error(`Unsupported plugin field: ${field}`)
  if (raw.schemaVersion !== 1) throw new Error('Unsupported plugin schemaVersion; expected 1')
  if (typeof raw.name !== 'string' || !validExtensionName(raw.name))
    throw new Error('Plugin name must use lowercase letters, digits and hyphens (1–64 characters)')
  if (typeof raw.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(raw.version))
    throw new Error('Plugin version must be a semantic version')
  if (typeof raw.description !== 'string' || !raw.description.trim()) throw new Error('Plugin description is required')
  const hooks = raw.hooks === undefined ? {} : object(raw.hooks, 'hooks')
  const events = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure']
  for (const event of Object.keys(hooks))
    if (!events.includes(event)) throw new Error(`Unsupported plugin hook: ${event}`)
  const manifest: PluginManifest = {
    schemaVersion: 1,
    name: raw.name,
    version: raw.version,
    description: raw.description,
    skills: strings(raw.skills, 'skills'),
    commands: strings(raw.commands, 'commands'),
    agents: strings(raw.agents, 'agents'),
    mcp: raw.mcp === undefined ? {} : object(raw.mcp, 'mcp'),
    hooks: {
      PreToolUse: strings(hooks.PreToolUse, 'hooks.PreToolUse'),
      PostToolUse: strings(hooks.PostToolUse, 'hooks.PostToolUse'),
      PostToolUseFailure: strings(hooks.PostToolUseFailure, 'hooks.PostToolUseFailure'),
    },
  }
  for (const path of [...manifest.skills, ...manifest.commands, ...manifest.agents]) await containedPath(root, path)
  return manifest
}

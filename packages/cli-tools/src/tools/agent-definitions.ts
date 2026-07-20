import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseFrontmatter, defaultConfigHome } from '@orchentra/cli-core'
import { BUILTIN_ROLES, setActiveRoles, type SubagentRole } from './subagent-roles'
import { resolveRepoRoot } from './worktree-writers'

/**
 * A user- or project-defined sub-agent type, loaded from a markdown file with
 * `---`-fenced frontmatter. `tools` is either a shorthand capability string
 * ("read-only" | "admin") or an explicit allowlist of tool names; the body is
 * the role's focus/system prompt. Definitions layer over the built-in roles,
 * so a project can add new agent types — or shadow a built-in — with no code
 * change. See docs/architecture/08-SUB-AGENTS.md for the discovery order.
 */
export interface AgentDefinition {
  name: string
  description: string
  tools: string | string[]
  /** Parsed and validated, but per-role model routing is not yet wired (see PR notes). */
  model?: string
  body: string
  source: string
}

export type ParseAgentDefinitionResult =
  { kind: 'ok'; definition: AgentDefinition } | { kind: 'error'; message: string }

/** Missing/empty `tools` caps the role at read-only — the safe default. */
function normalizeTools(raw: unknown): string | string[] {
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === 'string')
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim()
  return 'read-only'
}

export function parseAgentDefinition(text: string, source: string): ParseAgentDefinitionResult {
  const fm = parseFrontmatter(text)
  if (fm.kind === 'error') return { kind: 'error', message: fm.message }

  const name = fm.meta.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { kind: 'error', message: `agent definition at ${source} is missing a "name"` }
  }
  const description = fm.meta.description
  if (typeof description !== 'string' || description.trim().length === 0) {
    return { kind: 'error', message: `agent "${name}" is missing a "description"` }
  }

  return {
    kind: 'ok',
    definition: {
      name: name.trim(),
      description: description.trim(),
      tools: normalizeTools(fm.meta.tools),
      model: typeof fm.meta.model === 'string' && fm.meta.model.trim().length > 0 ? fm.meta.model.trim() : undefined,
      body: fm.body.trim(),
      source,
    },
  }
}

/**
 * Compiles a definition into the same `SubagentRole` shape the built-in roles
 * use, so discovered and built-in roles are interchangeable downstream
 * (restrictRegistry, resolveSubagentRole). The interface is unchanged.
 */
export function roleFromDefinition(def: AgentDefinition): SubagentRole {
  const base = {
    name: def.name,
    description: def.description,
    focus: def.body.length > 0 ? def.body : `You are the ${def.name} sub-agent completing a delegated task.`,
  }

  if (Array.isArray(def.tools)) {
    const allowed = new Set(def.tools)
    return { ...base, allows: (name) => allowed.has(name) }
  }
  switch (def.tools) {
    case 'admin':
    case 'all':
      return { ...base, unrestricted: true, allows: () => true }
    case 'read-only':
    default:
      // Unknown shorthands fall back to the safest cap rather than opening up.
      return { ...base, allows: (_name, requiredMode) => requiredMode === 'read-only' }
  }
}

/** built-in < discovered; discovered files earlier in the array are shadowed by later ones. */
export function mergeAgentRoles(definitions: AgentDefinition[]): Record<string, SubagentRole> {
  const merged: Record<string, SubagentRole> = { ...BUILTIN_ROLES }
  for (const def of definitions) merged[def.name] = roleFromDefinition(def)
  return merged
}

async function loadDir(dir: string): Promise<AgentDefinition[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    // A missing agents directory is the common case, not an error.
    return []
  }
  const defs: AgentDefinition[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const path = join(dir, entry.name)
    const parsed = parseAgentDefinition(await readFile(path, 'utf-8'), path)
    // A malformed file is skipped so one bad definition can't sink discovery.
    if (parsed.kind === 'ok') defs.push(parsed.definition)
  }
  return defs
}

/**
 * Discovers agent definitions in low-to-high precedence order, so a later
 * source shadows an earlier one on name collision:
 *   built-in  <  .claude/agents (cross-tool compat)  <  user home  <  project
 */
export async function discoverAgentDefinitions(cwd: string): Promise<AgentDefinition[]> {
  const projectRoot = (await resolveRepoRoot(cwd)) ?? cwd
  const dirs = [
    join(projectRoot, '.claude', 'agents'),
    join(defaultConfigHome(), 'agents'),
    join(projectRoot, '.orchentra', 'agents'),
  ]
  const all: AgentDefinition[] = []
  for (const dir of dirs) all.push(...(await loadDir(dir)))
  return all
}

/**
 * Startup entry point: discover + merge over the built-ins, publish the result
 * as the process-wide active role set, and return it for the agent tool's
 * schema enum. Runs once per CLI process, never per tool-call.
 */
export async function resolveAgentRoles(cwd: string): Promise<Record<string, SubagentRole>> {
  const merged = mergeAgentRoles(await discoverAgentDefinitions(cwd))
  setActiveRoles(merged)
  return merged
}

import type { PermissionMode, ToolContext, ToolRegistry, ToolResult } from '@orchentra/cli-core'

export interface SubagentRole {
  name: string
  /** One-line purpose statement surfaced in the agent tool's input schema. */
  description: string
  /** Role framing that replaces the generic completer line in the sub-agent's system prompt. */
  focus: string
  /** Roles with no capability cap skip registry wrapping entirely. */
  unrestricted?: boolean
  /**
   * Capability cap. `requiredMode` is the tool's entry in the registry's
   * requirements map (derived from its ToolLevel); undefined means the
   * registry could not classify the tool, which capped roles treat as deny.
   */
  allows(toolName: string, requiredMode: PermissionMode | undefined): boolean
}

const GENERIC_ROLE: SubagentRole = {
  name: 'generic',
  description: 'Default sub-agent with the full parent toolset',
  focus: 'You are a helpful coding assistant completing a specific sub-task.',
  unrestricted: true,
  allows: () => true,
}

const ROLES: Record<string, SubagentRole> = {
  explorer: {
    name: 'explorer',
    description: 'Read-only search and analysis; reports findings, cannot modify anything',
    focus:
      'You are an explorer sub-agent: search and read the codebase to answer the delegated question. You have read-only tools. Report concrete findings with file paths — do not propose to make changes yourself.',
    allows: (_name, requiredMode) => requiredMode === 'read-only',
  },
  reviewer: {
    name: 'reviewer',
    description: 'Verifies by running checks/tests; can read and execute but never edit',
    focus:
      'You are a reviewer sub-agent: verify the delegated claim by running the relevant checks (tests, typecheck, repro commands) and reading code. Never edit files — your trust comes from execution evidence, not fixes. Report each finding with the command output that corroborates it.',
    // Verify-by-running needs command execution even though bash is
    // admin-level; everything else stays read-only.
    allows: (name, requiredMode) => requiredMode === 'read-only' || name === 'bash',
  },
  builder: {
    name: 'builder',
    description: 'Implements a delegated slice with the full toolset',
    focus:
      'You are a builder sub-agent: implement the delegated slice completely. Follow lean-code discipline (YAGNI, minimum custom code), verify your change by running the relevant tests, and report what you changed and how it was verified.',
    unrestricted: true,
    allows: () => true,
  },
}

export interface ResolvedRole {
  role?: SubagentRole
  error?: string
}

export function resolveSubagentRole(name?: string): ResolvedRole {
  if (!name) return { role: GENERIC_ROLE }
  const role = ROLES[name]
  if (!role) {
    return { error: `unknown agentType "${name}"; valid types: ${Object.keys(ROLES).join(', ')}` }
  }
  return { role }
}

// Narrows a registry to what `role` allows, on both surfaces the sub-agent
// sees: the schemas advertised to the provider and the execute path — so a
// hallucinated call to a hidden tool is refused rather than silently run.
export function restrictRegistry(tools: ToolRegistry, role: SubagentRole): ToolRegistry {
  if (role.unrestricted) return tools
  const requirements = tools.requirements?.() ?? {}
  const allowed = (name: string): boolean => role.allows(name, requirements[name])
  return {
    list: () => tools.list().filter((schema) => allowed(schema.name)),
    requirements: () => requirements,
    has: (name) => allowed(name) && tools.has(name),
    register: (tool) => tools.register(tool),
    execute: async (name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> => {
      if (!allowed(name)) {
        return { content: `tool "${name}" is not available to a ${role.name} sub-agent`, isError: true }
      }
      return tools.execute(name, args, ctx)
    },
  }
}

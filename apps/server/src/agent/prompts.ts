import { z } from 'zod'
import type { Permission, ToolRegistry } from './tool-registry'

// ── Cacheable static head ────────────────────────────────────────────────
// Bytes here must be stable across incidents so Anthropic ephemeral caching hits.
const AGENT_PERSONA_HEAD = `You are an incident triage agent for engineering teams.

When a CI/CD failure is reported, your job is to:
1. Call tools to gather evidence — logs, commit changes, config files
2. Reason across the evidence to identify root cause
3. Stop when you have enough information for a confident assessment`

// ── Cacheable static tail ────────────────────────────────────────────────
const AGENT_STRATEGY_TAIL = `Tool calling strategy:
- Always start with get_workflow_logs — it has the most direct evidence
- If logs show a test failure or import error, call get_commit_changes to see what changed
- If logs mention a missing config, env var, or file — read that file with get_file_content
- If the CI workflow itself seems misconfigured, read .github/workflows/<name>.yml
- If logs reference a PR number or issue number, use get_pull_request or get_issue to get context
- If you need to find where a function/class/constant is defined or used, use search_code
- Stop early if evidence clearly points to a single cause

Rules:
- Never hallucinate log content. Quote exactly what you saw.
- If a tool returns an error, note "no data available from [source]" and reason with what you have
- Be specific — mention exact error messages, file paths, line numbers when visible in logs
- Confidence scoring: 0.9 = certain with evidence, 0.7 = strong signal, 0.5 = educated guess, 0.3 = speculation`

// ── Catalog rendering ────────────────────────────────────────────────────

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let inner = schema
  // ZodOptional / ZodNullable / ZodDefault all wrap an inner type on `_def.innerType`
  while ('innerType' in (inner._def as Record<string, unknown>)) {
    inner = (inner._def as { innerType: z.ZodTypeAny }).innerType
  }
  return inner
}

function zodTypeName(schema: z.ZodTypeAny): string {
  const inner = unwrap(schema)
  const def = inner._def as { typeName?: string; values?: unknown[] }
  switch (def.typeName) {
    case 'ZodString':
      return 'string'
    case 'ZodNumber':
      return 'number'
    case 'ZodBoolean':
      return 'boolean'
    case 'ZodArray':
      return 'array'
    case 'ZodObject':
      return 'object'
    case 'ZodEnum':
      return Array.isArray(def.values) ? def.values.map(String).join('|') : 'enum'
    default:
      return 'any'
  }
}

function renderArgs(schema: z.ZodSchema): string {
  if (!(schema instanceof z.ZodObject)) return ''
  const shape = schema.shape as Record<string, z.ZodTypeAny>
  const entries = Object.entries(shape)
  if (entries.length === 0) return '()'
  const parts = entries.map(([key, val]) => {
    const optional = val.isOptional() ? '?' : ''
    return `${key}${optional}: ${zodTypeName(val)}`
  })
  return `(${parts.join(', ')})`
}

export function renderToolCatalog(registry: ToolRegistry, allowed: Set<Permission>): string {
  const defs = registry.listDefinitions(allowed)
  if (defs.length === 0) return 'Available tools:\n(none)'
  const lines = ['Available tools:']
  for (const def of defs) {
    lines.push(`- ${def.name}${renderArgs(def.parameters)}: ${def.description}`)
  }
  return lines.join('\n')
}

// ── Public builder ───────────────────────────────────────────────────────

export interface BuildAgentSystemPromptArgs {
  registry: ToolRegistry
  /** Permission scope used to filter the rendered catalog. Defaults to read+write+admin. */
  permissions?: Set<Permission>
}

/**
 * Compose the full agent system prompt: cacheable persona head + tool catalog
 * rendered from the registry + cacheable strategy/rules tail.
 *
 * Head and tail bytes are stable across incidents; the catalog only changes
 * when registry membership changes, which is the desired cache invalidation.
 */
export function buildAgentSystemPrompt(args: BuildAgentSystemPromptArgs): string {
  const allowed = args.permissions ?? new Set<Permission>(['read', 'write', 'admin'])
  const catalog = renderToolCatalog(args.registry, allowed)
  return [AGENT_PERSONA_HEAD, '', catalog, '', AGENT_STRATEGY_TAIL].join('\n')
}

export const SYNTHESIS_PROMPT = `You are synthesizing an incident investigation into a structured brief.

You have access to the full investigation conversation including tool results.
Produce a classification with:
- failureType: the category that best fits
- summary: 1-2 sentence description of what happened
- rootCause: specific root cause with evidence (quote log lines if available)
- suggestedFix: an actionable fix — a command, file change, or config value
- confidence: 0.0-1.0 based on evidence quality
- similarIncidentId: if a similar past incident was provided and relevant, include its incident ID

If logs were available, your confidence should be higher. If only metadata was available, keep confidence below 0.6.

When similar past incidents are provided, use them to:
- Validate your root cause analysis against known patterns
- Suggest the same fix if the failure signature matches closely
- Increase confidence when a past pattern strongly aligns with current evidence
- Set similarIncidentId to the most relevant past incident's ID`

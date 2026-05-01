import type { ToolCall } from '../runtime/events'
import { commandTail } from './classifier'

export interface PolicyRule {
  readonly tool: string
  readonly pattern: string
  readonly decision: 'allow' | 'deny' | 'ask'
}

export interface Ruleset {
  readonly version: number
  readonly rules: readonly PolicyRule[]
}

export type PolicyVerdict =
  | { readonly kind: 'allow'; readonly rule: PolicyRule }
  | { readonly kind: 'deny'; readonly rule: PolicyRule }
  | { readonly kind: 'ask'; readonly rule: PolicyRule }
  | { readonly kind: 'no-match' }

/**
 * Pure policy decision. Walks the ruleset once collecting matching rules,
 * then applies precedence:
 *   1. Any matching deny → deny (last matching deny cited).
 *   2. Otherwise, any matching ask → ask (last matching ask cited).
 *   3. Otherwise, any matching allow → allow (last matching allow cited).
 *   4. Otherwise → no-match (caller falls through to next layer).
 *
 * "Last cited" lets users tighten a broad rule with a more specific one
 * later in the file, even though the global deny-precedence still applies.
 * Ask sits between deny and allow so users can force prompts on otherwise
 * allowed commands (e.g. allow `git *` but ask on `git push *`).
 */
export function evaluate(toolCall: ToolCall, ruleset: Ruleset): PolicyVerdict {
  const canonical = canonicalize(toolCall)
  let lastAllow: PolicyRule | null = null
  let lastAsk: PolicyRule | null = null
  let lastDeny: PolicyRule | null = null
  for (const rule of ruleset.rules) {
    if (rule.tool !== toolCall.name) continue
    if (!matches(rule.pattern, canonical)) continue
    if (rule.decision === 'deny') lastDeny = rule
    else if (rule.decision === 'ask') lastAsk = rule
    else lastAllow = rule
  }
  if (lastDeny) return { kind: 'deny', rule: lastDeny }
  if (lastAsk) return { kind: 'ask', rule: lastAsk }
  if (lastAllow) return { kind: 'allow', rule: lastAllow }
  return { kind: 'no-match' }
}

function canonicalize(toolCall: ToolCall): string {
  if (toolCall.name === 'bash') {
    const cmd = bashCommand(toolCall.input)
    if (!cmd) return ''
    return commandTail(cmd)
  }
  // Non-bash tools match on tool name only — canonical is empty string,
  // so pattern "*" / "" matches and any other pattern does not.
  return ''
}

function bashCommand(input: unknown): string | null {
  if (input && typeof input === 'object' && 'command' in input) {
    const cmd = (input as { command: unknown }).command
    if (typeof cmd === 'string') return cmd
  }
  return null
}

/**
 * Glob match. `*` matches any run of characters (including spaces), `**` is
 * an alias for the same (kept for users who prefer the explicit deep-glob
 * spelling). Anchored on both ends.
 */
function matches(pattern: string, value: string): boolean {
  const normalized = pattern.replace(/\*\*/g, '*')
  const re = new RegExp('^' + normalized.split('*').map(escapeRegex).join('.*') + '$')
  return re.test(value)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

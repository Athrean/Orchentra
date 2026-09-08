import {
  evaluate,
  type PermissionRuleConfig,
  type PolicyRule,
  type PolicyVerdict,
  type Ruleset,
  type ToolCall,
} from '@orchentra/cli-core'

const aliases: Record<string, string> = {
  Bash: 'bash',
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'edit_file',
  Glob: 'glob_search',
  Grep: 'grep_search',
  WebFetch: 'web_fetch',
  WebSearch: 'web_search',
  Skill: 'skill',
}

/** User-invoked skill allowances are scoped to one turn and never beat deny/ask rules or mode caps. */
export function skillPolicy(call: ToolCall, base: Ruleset, overlay?: PermissionRuleConfig): PolicyVerdict {
  const primary = evaluate(call, base)
  if (primary.kind === 'deny' || primary.kind === 'ask' || !overlay) return primary
  const rules: PolicyRule[] = []
  for (const raw of overlay.allow) {
    const match = /^([^()\s]+)(?:\((.*)\))?$/.exec(raw)
    if (!match) continue
    const name = aliases[match[1]!] ?? match[1]!
    const expression =
      '^' +
      name
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$'
    if (!new RegExp(expression).test(call.name)) continue
    rules.push({ tool: call.name, pattern: (match[2] ?? '*').replace(/:\*/g, ' *'), decision: 'allow' })
  }
  const skill = evaluate(call, { version: 1, rules })
  return skill.kind === 'no-match' ? primary : skill
}

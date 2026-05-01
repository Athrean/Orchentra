export type RuleDecision = 'allow' | 'deny'

export interface StoredPermissionRule {
  readonly tool: string
  readonly pattern: string
  readonly decision: RuleDecision
}

export type StoreVerdict = RuleDecision | 'unknown'

export interface PermissionStore {
  decide(toolName: string, input: unknown): StoreVerdict
  remember(rule: StoredPermissionRule): void
  list(): readonly StoredPermissionRule[]
}

export function createPermissionStore(): PermissionStore {
  const rules: StoredPermissionRule[] = []

  return {
    decide(toolName, input) {
      const flat = flatten(toolName, input)
      let allow = false
      for (const r of rules) {
        if (r.tool !== toolName) continue
        if (!matches(r.pattern, flat)) continue
        if (r.decision === 'deny') return 'deny'
        allow = true
      }
      return allow ? 'allow' : 'unknown'
    },
    remember(rule) {
      const dup = rules.find((r) => r.tool === rule.tool && r.pattern === rule.pattern && r.decision === rule.decision)
      if (dup) return
      rules.push(rule)
    },
    list() {
      return rules.slice()
    },
  }
}

function flatten(toolName: string, input: unknown): string {
  if (toolName === 'bash' && input && typeof input === 'object' && 'command' in input) {
    const cmd = (input as { command: unknown }).command
    if (typeof cmd === 'string') return cmd
  }
  return JSON.stringify(input)
}

/**
 * Glob match — `*` matches any run of characters; everything else literal.
 * Anchored on both ends. No `?`/charclass/escape support yet.
 */
function matches(pattern: string, value: string): boolean {
  const re = new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + '$')
  return re.test(value)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

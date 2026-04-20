export type PermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access' | 'prompt' | 'allow'

export type ToolLevel = 'read' | 'write' | 'admin'

export interface PermissionDecision {
  allowed: boolean
  requiresConfirmation: boolean
  reason?: string
}

const MODE_RANK: Record<PermissionMode, number> = {
  'read-only': 0,
  'workspace-write': 1,
  'danger-full-access': 2,
  prompt: 3,
  allow: 4,
}

export function permissionModeRank(mode: PermissionMode): number {
  return MODE_RANK[mode]
}

export type PermissionOverride = 'allow' | 'deny' | 'ask'

export interface PermissionContext {
  overrideDecision?: PermissionOverride
  overrideReason?: string
}

export interface PermissionRequest {
  toolName: string
  input: string
  currentMode: PermissionMode
  requiredMode: PermissionMode
  reason?: string
}

export type PermissionPromptDecision = { kind: 'allow' } | { kind: 'deny'; reason: string }

export interface PermissionPrompter {
  decide(request: PermissionRequest): PermissionPromptDecision
}

export type PermissionOutcome = { kind: 'allow' } | { kind: 'deny'; reason: string }

export type PermissionRuleMatcher =
  | { kind: 'any' }
  | { kind: 'exact'; value: string }
  | { kind: 'prefix'; prefix: string }

export interface PermissionRuleConfig {
  allow: string[]
  deny: string[]
  ask: string[]
}

export interface PermissionRule {
  raw: string
  toolName: string
  matcher: PermissionRuleMatcher
}

export function parseRule(raw: string): PermissionRule {
  const trimmed = raw.trim()
  const open = findFirstUnescaped(trimmed, '(')
  const close = findLastUnescaped(trimmed, ')')

  if (open !== null && close !== null && close === trimmed.length - 1 && open < close) {
    const toolName = trimmed.slice(0, open).trim()
    const content = trimmed.slice(open + 1, close)
    if (toolName.length > 0) {
      return { raw: trimmed, toolName, matcher: parseRuleMatcher(content) }
    }
  }

  return { raw: trimmed, toolName: trimmed, matcher: { kind: 'any' } }
}

function parseRuleMatcher(content: string): PermissionRuleMatcher {
  const unescaped = unescapeRuleContent(content.trim())
  if (unescaped.length === 0 || unescaped === '*') {
    return { kind: 'any' }
  }
  if (unescaped.endsWith(':*')) {
    return { kind: 'prefix', prefix: unescaped.slice(0, -2) }
  }
  return { kind: 'exact', value: unescaped }
}

function unescapeRuleContent(content: string): string {
  return content.split('\\(').join('(').split('\\)').join(')').split('\\\\').join('\\')
}

function findFirstUnescaped(value: string, needle: string): number | null {
  let escaped = false
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '\\') {
      escaped = !escaped
      continue
    }
    if (ch === needle && !escaped) {
      return i
    }
    escaped = false
  }
  return null
}

function findLastUnescaped(value: string, needle: string): number | null {
  for (let i = value.length - 1; i >= 0; i--) {
    if (value[i] !== needle) continue
    let backslashes = 0
    for (let j = i - 1; j >= 0; j--) {
      if (value[j] === '\\') backslashes++
      else break
    }
    if (backslashes % 2 === 0) return i
  }
  return null
}

export function extractPermissionSubject(input: string): string | null {
  try {
    const parsed = JSON.parse(input)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      for (const key of [
        'command',
        'path',
        'file_path',
        'filePath',
        'notebook_path',
        'notebookPath',
        'url',
        'pattern',
        'code',
        'message',
      ]) {
        const value = (parsed as Record<string, unknown>)[key]
        if (typeof value === 'string') return value
      }
    }
  } catch {
    // not JSON
  }
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : null
}

function ruleMatches(rule: PermissionRule, toolName: string, input: string): boolean {
  if (rule.toolName !== toolName) return false
  const subject = extractPermissionSubject(input)
  switch (rule.matcher.kind) {
    case 'any':
      return true
    case 'exact':
      return subject === rule.matcher.value
    case 'prefix':
      return subject !== null && subject.startsWith(rule.matcher.prefix)
  }
}

function findMatchingRule(rules: PermissionRule[], toolName: string, input: string): PermissionRule | undefined {
  return rules.find((rule) => ruleMatches(rule, toolName, input))
}

export class PermissionPolicy {
  private activeModeValue: PermissionMode
  private toolRequirements: Map<string, PermissionMode> = new Map()
  private allowRules: PermissionRule[] = []
  private denyRules: PermissionRule[] = []
  private askRules: PermissionRule[] = []

  constructor(activeMode: PermissionMode) {
    this.activeModeValue = activeMode
  }

  withToolRequirement(toolName: string, requiredMode: PermissionMode): this {
    this.toolRequirements.set(toolName, requiredMode)
    return this
  }

  withPermissionRules(config: PermissionRuleConfig): this {
    this.allowRules = config.allow.map(parseRule)
    this.denyRules = config.deny.map(parseRule)
    this.askRules = config.ask.map(parseRule)
    return this
  }

  activeMode(): PermissionMode {
    return this.activeModeValue
  }

  requiredModeFor(toolName: string): PermissionMode {
    return this.toolRequirements.get(toolName) ?? 'danger-full-access'
  }

  authorize(toolName: string, input: string, prompter?: PermissionPrompter): PermissionOutcome {
    return this.authorizeWithContext(toolName, input, {}, prompter)
  }

  authorizeWithContext(
    toolName: string,
    input: string,
    context: PermissionContext,
    prompter?: PermissionPrompter,
  ): PermissionOutcome {
    const denyRule = findMatchingRule(this.denyRules, toolName, input)
    if (denyRule) {
      return { kind: 'deny', reason: `Permission to use ${toolName} has been denied by rule '${denyRule.raw}'` }
    }

    const currentMode = this.activeMode()
    const requiredMode = this.requiredModeFor(toolName)
    const askRule = findMatchingRule(this.askRules, toolName, input)
    const allowRule = findMatchingRule(this.allowRules, toolName, input)

    if (context.overrideDecision === 'deny') {
      return {
        kind: 'deny',
        reason: context.overrideReason ?? `tool '${toolName}' denied by hook`,
      }
    }

    if (context.overrideDecision === 'ask') {
      const reason = context.overrideReason ?? `tool '${toolName}' requires approval due to hook guidance`
      return promptOrDeny(toolName, input, currentMode, requiredMode, reason, prompter)
    }

    if (context.overrideDecision === 'allow') {
      if (askRule) {
        const reason = `tool '${toolName}' requires approval due to ask rule '${askRule.raw}'`
        return promptOrDeny(toolName, input, currentMode, requiredMode, reason, prompter)
      }
      if (allowRule || currentMode === 'allow' || permissionModeRank(currentMode) >= permissionModeRank(requiredMode)) {
        return { kind: 'allow' }
      }
    }

    if (askRule) {
      const reason = `tool '${toolName}' requires approval due to ask rule '${askRule.raw}'`
      return promptOrDeny(toolName, input, currentMode, requiredMode, reason, prompter)
    }

    if (allowRule || currentMode === 'allow' || permissionModeRank(currentMode) >= permissionModeRank(requiredMode)) {
      return { kind: 'allow' }
    }

    if (currentMode === 'prompt' || (currentMode === 'workspace-write' && requiredMode === 'danger-full-access')) {
      const reason = `tool '${toolName}' requires approval to escalate from ${currentMode} to ${requiredMode}`
      return promptOrDeny(toolName, input, currentMode, requiredMode, reason, prompter)
    }

    return {
      kind: 'deny',
      reason: `tool '${toolName}' requires ${requiredMode} permission; current mode is ${currentMode}`,
    }
  }
}

function promptOrDeny(
  toolName: string,
  input: string,
  currentMode: PermissionMode,
  requiredMode: PermissionMode,
  reason: string | undefined,
  prompter?: PermissionPrompter,
): PermissionOutcome {
  const request: PermissionRequest = {
    toolName,
    input,
    currentMode,
    requiredMode,
    reason,
  }

  if (prompter) {
    const decision = prompter.decide(request)
    if (decision.kind === 'allow') return { kind: 'allow' }
    return { kind: 'deny', reason: decision.reason }
  }

  return {
    kind: 'deny',
    reason: reason ?? `tool '${toolName}' requires approval to run while mode is ${currentMode}`,
  }
}

export function decide(mode: PermissionMode, level: ToolLevel): PermissionDecision {
  if (mode === 'danger-full-access' || mode === 'allow') {
    return { allowed: true, requiresConfirmation: false }
  }
  if (mode === 'read-only') {
    if (level === 'read') {
      return { allowed: true, requiresConfirmation: false }
    }
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `blocked: session is read-only, tool requires ${level}`,
    }
  }
  if (mode === 'prompt') {
    return { allowed: true, requiresConfirmation: level !== 'read' }
  }
  // workspace-write
  if (level === 'read') {
    return { allowed: true, requiresConfirmation: false }
  }
  if (level === 'admin') {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: 'blocked: admin tools disabled outside danger-full-access',
    }
  }
  return { allowed: true, requiresConfirmation: true }
}

export function isPermissionMode(value: string): value is PermissionMode {
  return ['read-only', 'prompt-on-write', 'workspace-write', 'danger-full-access', 'prompt', 'allow'].includes(value)
}

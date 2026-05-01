import type { ToolCall } from '../runtime/events'
import { permissionModeRank, type PermissionMode } from '../runtime/permissions'
import { detectDestructive } from './destructive'
import { isBashReadOnly } from './bash-read-only'
import type { PolicyRule, PolicyVerdict } from './policy'
import type { PermissionStore } from './store'

export type PromptChoice = 'allow-once' | 'allow-pattern' | 'deny' | 'cancel'

export interface PromptRequest {
  readonly toolName: string
  readonly inputJson: string
  /** Glob hint shown next to "Yes, and allow this pattern". */
  readonly suggestedPattern: string
  /** Active mode at the time of the prompt. */
  readonly currentMode: PermissionMode
  /** Mode the tool requires, when prompting because of escalation. */
  readonly requiredMode?: PermissionMode
  /** Why the user is being prompted (hook reason / matched ask rule / escalation copy). */
  readonly reason?: string
}

export type AskUser = (request: PromptRequest) => Promise<PromptChoice>

export type Decision = { kind: 'allow' } | { kind: 'deny'; reason: string }

export interface EnforcerContext {
  readonly mode: PermissionMode
  readonly askUser: AskUser
  readonly store?: PermissionStore
  /**
   * Optional declarative-policy hook. Called with the tool call; returns the
   * verdict from the policy engine. When present, consulted between the
   * destructive-pattern check and the in-memory store.
   */
  readonly policy?: (toolCall: ToolCall) => PolicyVerdict
  /**
   * Optional sink invoked when a policy rule fires (allow, deny, or ask).
   * UIs use it to surface "auto-allowed by policy: <pattern>" / "denied by
   * policy: <pattern>" / "ask required by policy: <pattern>" notices so
   * users see what is silently approving, blocking, or forcing a prompt.
   */
  readonly notifyPolicy?: (info: {
    readonly kind: 'allow' | 'deny' | 'ask'
    readonly rule: PolicyRule
  }) => Promise<void>
  /**
   * Optional sink for destructive-pattern denials. The enforcer does not
   * await it for the decision — the call is denied either way — but UIs can
   * use it to surface a red banner so the user knows what was blocked and
   * why. Awaited so callers can sequence the banner ahead of the next turn.
   */
  readonly notifyDeny?: (info: {
    readonly toolName: string
    readonly inputJson: string
    readonly reason: string
  }) => Promise<void>
  /**
   * Optional per-tool minimum mode. When the active mode rank is lower than
   * the required mode, "allow" verdicts (policy / store) are downgraded to a
   * user prompt — escalation must be confirmed every time. Tools not present
   * default to the active mode (no escalation).
   */
  readonly toolRequirements?: Readonly<Record<string, PermissionMode>>
  /**
   * Optional override emitted by a pre-tool hook (HookRunResult.permissionOverride).
   * Threaded into the decision: "deny" short-circuits with the hook's reason;
   * "ask" forces a user prompt; "allow" skips the policy.allow/store/mode-allow
   * paths but still defers to a matching policy.ask rule (so a user-defined ask
   * rule cannot be silently bypassed by a hook). Destructive patterns still win.
   */
  readonly hookOverride?: {
    readonly decision: 'allow' | 'deny' | 'ask'
    readonly reason?: string
  }
}

export interface Enforcer {
  enforce(toolCall: ToolCall, ctx: EnforcerContext): Promise<Decision>
}

const READ_TOOLS = new Set(['read', 'glob', 'grep', 'web_search'])

export function createEnforcer(): Enforcer {
  return {
    async enforce(toolCall, ctx) {
      if (toolCall.name.toLowerCase() === 'bash') {
        const cmd = extractBashCommand(toolCall.input)
        if (cmd) {
          const destructive = detectDestructive(cmd)
          if (destructive) {
            const reason = `destructive pattern: ${destructive.name}`
            await ctx.notifyDeny?.({
              toolName: toolCall.name,
              inputJson: JSON.stringify(toolCall.input),
              reason,
            })
            return { kind: 'deny', reason }
          }
        }
      }

      const hook = ctx.hookOverride
      if (hook?.decision === 'deny') {
        return { kind: 'deny', reason: hook.reason ?? `denied by pre-tool hook for ${toolCall.name}` }
      }
      if (hook?.decision === 'ask') {
        return promptUser(toolCall, ctx, { reason: hook.reason })
      }

      if (toolCall.name.toLowerCase() === 'bash' && !hook) {
        const cmd = extractBashCommand(toolCall.input)
        if (cmd && isBashReadOnly(cmd)) return { kind: 'allow' }
      }

      if (ctx.policy) {
        const v = ctx.policy(toolCall)
        if (v.kind === 'deny') {
          await ctx.notifyPolicy?.({ kind: 'deny', rule: v.rule })
          return { kind: 'deny', reason: `policy deny: ${v.rule.pattern}` }
        }
        if (v.kind === 'ask') {
          await ctx.notifyPolicy?.({ kind: 'ask', rule: v.rule })
          return promptUser(toolCall, ctx, { reason: `matches ask rule '${v.rule.pattern}'` })
        }
        if (v.kind === 'allow' && !needsEscalation(ctx, toolCall)) {
          await ctx.notifyPolicy?.({ kind: 'allow', rule: v.rule })
          return { kind: 'allow' }
        }
        if (v.kind === 'allow' && needsEscalation(ctx, toolCall)) {
          await ctx.notifyPolicy?.({ kind: 'allow', rule: v.rule })
          return promptUser(toolCall, ctx, escalationReason(ctx, toolCall))
        }
      }

      if (hook?.decision === 'allow') {
        return { kind: 'allow' }
      }

      if (READ_TOOLS.has(toolCall.name.toLowerCase())) return { kind: 'allow' }

      if (ctx.store) {
        const verdict = ctx.store.decide(toolCall.name, toolCall.input)
        if (verdict === 'deny') return { kind: 'deny', reason: 'denied by stored rule' }
        if (verdict === 'allow' && !needsEscalation(ctx, toolCall)) return { kind: 'allow' }
        if (verdict === 'allow' && needsEscalation(ctx, toolCall)) {
          return promptUser(toolCall, ctx, escalationReason(ctx, toolCall))
        }
      }

      if (needsEscalation(ctx, toolCall)) {
        return promptUser(toolCall, ctx, escalationReason(ctx, toolCall))
      }
      return promptUser(toolCall, ctx)
    },
  }
}

function needsEscalation(ctx: EnforcerContext, toolCall: ToolCall): boolean {
  if (!ctx.toolRequirements) return false
  const required = ctx.toolRequirements[toolCall.name]
  if (!required) return false
  return permissionModeRank(ctx.mode) < permissionModeRank(required)
}

function escalationReason(ctx: EnforcerContext, toolCall: ToolCall): { reason: string; requiredMode?: PermissionMode } {
  const required = ctx.toolRequirements?.[toolCall.name]
  return {
    reason: `requires escalation from ${ctx.mode} to ${required ?? ctx.mode}`,
    requiredMode: required,
  }
}

interface PromptOptions {
  reason?: string
  requiredMode?: PermissionMode
}

async function promptUser(toolCall: ToolCall, ctx: EnforcerContext, opts: PromptOptions = {}): Promise<Decision> {
  const suggestedPattern = deriveSuggestedPattern(toolCall)
  const request: PromptRequest = {
    toolName: toolCall.name,
    inputJson: JSON.stringify(toolCall.input),
    suggestedPattern,
    currentMode: ctx.mode,
    requiredMode: opts.requiredMode,
    reason: opts.reason,
  }
  const choice = await ctx.askUser(request)

  if (choice === 'allow-pattern') {
    ctx.store?.remember({ tool: toolCall.name, pattern: suggestedPattern, decision: 'allow' })
    return { kind: 'allow' }
  }
  if (choice === 'allow-once') return { kind: 'allow' }
  if (choice === 'cancel') return { kind: 'deny', reason: 'user cancelled the prompt' }
  return { kind: 'deny', reason: 'user denied this command' }
}

function deriveSuggestedPattern(toolCall: ToolCall): string {
  if (toolCall.name.toLowerCase() === 'bash') {
    const cmd = extractBashCommand(toolCall.input)
    if (cmd) {
      const head = cmd.trim().split(/\s+/).slice(0, 2).join(' ')
      return `${head} *`
    }
  }
  return toolCall.name
}

function extractBashCommand(input: unknown): string | null {
  if (input && typeof input === 'object' && 'command' in input) {
    const cmd = (input as { command: unknown }).command
    if (typeof cmd === 'string') return cmd
  }
  return null
}

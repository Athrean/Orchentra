import type { ToolCall } from '../runtime/events'
import type { PermissionMode } from '../runtime/permissions'
import type { PermissionStore } from './store'

export type PromptChoice = 'allow-once' | 'allow-pattern' | 'deny' | 'cancel'

export interface PromptRequest {
  readonly toolName: string
  readonly inputJson: string
  /** Glob hint shown next to "Yes, and allow this pattern". */
  readonly suggestedPattern: string
}

export type AskUser = (request: PromptRequest) => Promise<PromptChoice>

export type Decision = { kind: 'allow' } | { kind: 'deny'; reason: string }

export interface EnforcerContext {
  readonly mode: PermissionMode
  readonly askUser: AskUser
  readonly store?: PermissionStore
}

export interface Enforcer {
  enforce(toolCall: ToolCall, ctx: EnforcerContext): Promise<Decision>
}

const READ_TOOLS = new Set(['read', 'glob', 'grep', 'web_search'])

export function createEnforcer(): Enforcer {
  return {
    async enforce(toolCall, ctx) {
      if (READ_TOOLS.has(toolCall.name.toLowerCase())) return { kind: 'allow' }

      if (ctx.store) {
        const verdict = ctx.store.decide(toolCall.name, toolCall.input)
        if (verdict === 'allow') return { kind: 'allow' }
        if (verdict === 'deny') return { kind: 'deny', reason: 'denied by stored rule' }
      }

      const suggestedPattern = deriveSuggestedPattern(toolCall)
      const request: PromptRequest = {
        toolName: toolCall.name,
        inputJson: JSON.stringify(toolCall.input),
        suggestedPattern,
      }
      const choice = await ctx.askUser(request)

      if (choice === 'allow-pattern') {
        ctx.store?.remember({ tool: toolCall.name, pattern: suggestedPattern, decision: 'allow' })
        return { kind: 'allow' }
      }
      if (choice === 'allow-once') return { kind: 'allow' }
      if (choice === 'cancel') return { kind: 'deny', reason: 'user cancelled the prompt' }
      return { kind: 'deny', reason: 'user denied this command' }
    },
  }
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

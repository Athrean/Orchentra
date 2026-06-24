import type { EffortTier, Provider } from '@orchentra/cli-core'
import {
  AnthropicProvider,
  DASHSCOPE_CONFIG,
  GeminiProvider,
  OpenAiCompatProvider,
  OPENAI_CONFIG,
  XAI_CONFIG,
} from '@orchentra/cli-api'

const BUILTIN_MODEL_ALIASES: Record<string, string> = {
  opus: 'claude-opus-4-20250514',
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-haiku-4-20250514',
  grok: 'grok-3',
  'grok-mini': 'grok-3-mini',
  gemini: 'gemini-2.0-flash',
  'gemini-pro': 'gemini-2.0-pro',
  'gemini-flash': 'gemini-2.0-flash',
}

export interface CreatedProvider {
  readonly provider: Provider
  readonly providerName: string
}

export function resolveModelAlias(input: string, userAliases?: Record<string, string>): string {
  const lower = input.toLowerCase()
  if (userAliases && userAliases[lower]) return userAliases[lower]
  if (BUILTIN_MODEL_ALIASES[lower]) return BUILTIN_MODEL_ALIASES[lower]
  return input
}

export function createProvider(model: string): CreatedProvider {
  const providerName = resolveProviderName(model)
  switch (providerName) {
    case 'openai':
      return { providerName, provider: new OpenAiCompatProvider(OPENAI_CONFIG) }
    case 'xai':
      return { providerName, provider: new OpenAiCompatProvider(XAI_CONFIG) }
    case 'dashscope':
      return { providerName, provider: new OpenAiCompatProvider(DASHSCOPE_CONFIG) }
    case 'gemini':
      return { providerName, provider: new GeminiProvider({ model }) }
    case 'anthropic':
      return { providerName, provider: new AnthropicProvider() }
  }
}

export function resolveProviderName(model: string): 'openai' | 'xai' | 'dashscope' | 'gemini' | 'anthropic' {
  const lower = model.toLowerCase()
  if (lower.startsWith('gpt') || lower.includes('openai')) return 'openai'
  if (lower.startsWith('grok') || lower.includes('xai')) return 'xai'
  if (lower.includes('qwen') || lower.includes('dashscope')) return 'dashscope'
  if (lower.startsWith('gemini') || lower.includes('google')) return 'gemini'
  return 'anthropic'
}

export function thinkingTokenBudgetForEffort(effort: EffortTier): number {
  switch (effort) {
    case 'low':
      return 1024
    case 'medium':
      return 4096
    case 'high':
      return 8192
  }
}

export function builtinModelAliases(): readonly string[] {
  return Object.keys(BUILTIN_MODEL_ALIASES)
}

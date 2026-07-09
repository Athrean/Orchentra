import type { EffortTier, Provider } from '@orchentra/cli-core'
import {
  AnthropicProvider,
  DASHSCOPE_CONFIG,
  GeminiProvider,
  LOCAL_CONFIG,
  OpenAiCompatProvider,
  OPENAI_CONFIG,
  OPENROUTER_CONFIG,
  XAI_CONFIG,
} from '@orchentra/cli-api'
import { DEFAULT_MODEL_ID, DEFAULT_OPUS_MODEL_ID, DEFAULT_HAIKU_MODEL_ID } from './model-catalog'

const BUILTIN_MODEL_ALIASES: Record<string, string> = {
  opus: DEFAULT_OPUS_MODEL_ID,
  sonnet: DEFAULT_MODEL_ID,
  haiku: DEFAULT_HAIKU_MODEL_ID,
  fable: 'claude-fable-5',
  grok: 'grok-4.3',
  gemini: 'gemini-3.1-pro-preview',
  'gemini-pro': 'gemini-3.1-pro-preview',
  qwen: 'qwen/qwen3.6-35b-a3b',
  glm: 'z-ai/glm-5.2',
  mistral: 'mistralai/mistral-medium-3-5',
  deepseek: 'deepseek/deepseek-v4-pro',
  'gpt-oss': 'openai/gpt-oss-120b',
  'gpt-oss-local': 'ollama/gpt-oss:120b',
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
    case 'openrouter':
      return { providerName, provider: new OpenAiCompatProvider(OPENROUTER_CONFIG) }
    case 'xai':
      return { providerName, provider: new OpenAiCompatProvider(XAI_CONFIG) }
    case 'dashscope':
      return { providerName, provider: new OpenAiCompatProvider(DASHSCOPE_CONFIG) }
    case 'local':
      return { providerName, provider: new OpenAiCompatProvider(LOCAL_CONFIG) }
    case 'gemini':
      return { providerName, provider: new GeminiProvider({ model }) }
    case 'anthropic':
      return { providerName, provider: new AnthropicProvider() }
  }
}

export function resolveProviderName(
  model: string,
): 'openai' | 'openrouter' | 'xai' | 'dashscope' | 'gemini' | 'anthropic' | 'local' {
  const lower = model.toLowerCase()
  if (lower.startsWith('ollama/')) return 'local'
  if (isOpenRouterModelId(lower)) return 'openrouter'
  if (lower.startsWith('gpt') || lower.includes('openai')) return 'openai'
  if (lower.startsWith('grok') || lower.includes('xai')) return 'xai'
  if (lower.includes('qwen') || lower.includes('dashscope')) return 'dashscope'
  if (lower.startsWith('gemini') || lower.includes('google')) return 'gemini'
  return 'anthropic'
}

function isOpenRouterModelId(model: string): boolean {
  return (
    model.startsWith('openai/') ||
    model.startsWith('anthropic/') ||
    model.startsWith('google/') ||
    model.startsWith('x-ai/') ||
    model.startsWith('mistralai/') ||
    model.startsWith('deepseek/') ||
    model.startsWith('qwen/') ||
    model.startsWith('z-ai/') ||
    model.startsWith('zhipu/')
  )
}

export function thinkingTokenBudgetForEffort(effort: EffortTier): number {
  switch (effort) {
    case 'low':
      return 1024
    case 'medium':
      return 4096
    case 'high':
      return 8192
    case 'xhigh':
      return 16384
    case 'max':
      return 32768
  }
}

export function builtinModelAliases(): readonly string[] {
  return Object.keys(BUILTIN_MODEL_ALIASES)
}

import { profileFor, type EffortTier, type Provider, type ProviderName } from '@orchentra/cli-core'
import {
  AnthropicProvider,
  DASHSCOPE_CONFIG,
  GeminiProvider,
  LOCAL_CONFIG,
  OpenAiCompatProvider,
  OPENAI_CONFIG,
  OPENROUTER_CONFIG,
  ResponsesProvider,
  ZEN_CONFIG,
  ZEN_RESPONSES_CONFIG,
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

// Provider routing resolves through the ModelProfile registry (M5) — the old
// resolveProviderName/isOpenRouterModelId string sniffing retired into
// cli-core's MODEL_PROFILES. This switch only maps route → constructor.
export function createProvider(model: string): CreatedProvider {
  const providerName: ProviderName = profileFor(model).provider
  switch (providerName) {
    case 'openai':
      return { providerName, provider: new OpenAiCompatProvider(OPENAI_CONFIG) }
    case 'openrouter':
      return { providerName, provider: new OpenAiCompatProvider(OPENROUTER_CONFIG) }
    case 'xai':
      return { providerName, provider: new OpenAiCompatProvider(XAI_CONFIG) }
    case 'dashscope':
      return { providerName, provider: new OpenAiCompatProvider(DASHSCOPE_CONFIG) }
    case 'zen':
      return { providerName, provider: zenProvider(model) }
    case 'local':
      return { providerName, provider: new OpenAiCompatProvider(LOCAL_CONFIG) }
    case 'gemini':
      return { providerName, provider: new GeminiProvider({ model }) }
    case 'anthropic':
      return { providerName, provider: new AnthropicProvider() }
  }
}

/**
 * The Zen gateway serves each family on its own endpoint. GPT/Grok/Muse Spark
 * are Responses-only; DeepSeek/GLM/Kimi/MiniMax and the free tier speak
 * chat/completions. Claude/Qwen (Anthropic `/messages`) and Gemini (Google
 * `/models/*`) are not wired yet, and saying so beats an opaque gateway error.
 */
function zenProvider(model: string): Provider {
  const id = model.replace(/^zen\//i, '')
  if (/^(gpt-|grok-|muse-spark-)/i.test(id)) return new ResponsesProvider(ZEN_RESPONSES_CONFIG)
  if (/^(claude-|qwen|gemini-)/i.test(id)) {
    throw new Error(
      `zen/${id} is served on an endpoint Orchentra does not implement yet (Anthropic messages or Google). Use a GPT, Grok, Muse Spark, DeepSeek, GLM, Kimi, MiniMax, or free-tier model id.`,
    )
  }
  return new OpenAiCompatProvider(ZEN_CONFIG)
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

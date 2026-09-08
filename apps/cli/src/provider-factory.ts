import { profileFor, type EffortTier, type Provider, type ProviderName } from '@orchentra/cli-core'
import {
  AnthropicProvider,
  CodexBackendProvider,
  DASHSCOPE_CONFIG,
  GeminiCodeAssistProvider,
  GeminiProvider,
  getCredential,
  isCodexBackendLogin,
  LOCAL_CONFIG,
  OpenAiCompatProvider,
  OPENAI_CONFIG,
  OPENROUTER_CONFIG,
  ResponsesProvider,
  ZEN_CONFIG,
  ZEN_GO_CONFIG,
  ZEN_GO_RESPONSES_CONFIG,
  ZEN_RESPONSES_CONFIG,
  XAI_CONFIG,
} from '@orchentra/cli-api'
import { DEFAULT_MODEL_ID, DEFAULT_OPUS_MODEL_ID, DEFAULT_HAIKU_MODEL_ID } from './model-catalog'

const BUILTIN_MODEL_ALIASES: Record<string, string> = {
  opus: DEFAULT_OPUS_MODEL_ID,
  sonnet: DEFAULT_MODEL_ID,
  haiku: DEFAULT_HAIKU_MODEL_ID,
  fable: 'claude-fable-5-1',
  grok: 'grok-4.3',
  gemini: 'antigravity/gemini-3.6-flash-high',
  'gemini-pro': 'antigravity/gemini-3.1-pro-low',
  qwen: 'qwen/qwen3.6-35b-a3b',
  glm: 'z-ai/glm-5.2',
  go: 'go/omen-alpha',
  zen: 'zen/muse-spark-1.3-contributor-free',
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
      // A stored ChatGPT (Codex) subscription login routes through the ChatGPT
      // backend; an explicit OPENAI_API_KEY still wins via the compat path.
      if (!process.env['OPENAI_API_KEY'] && isCodexBackendLogin()) {
        return { providerName, provider: new CodexBackendProvider() }
      }
      return { providerName, provider: new OpenAiCompatProvider(OPENAI_CONFIG) }
    case 'openrouter':
      return { providerName, provider: new OpenAiCompatProvider(OPENROUTER_CONFIG) }
    case 'xai':
      return { providerName, provider: new OpenAiCompatProvider(XAI_CONFIG) }
    case 'dashscope':
      return { providerName, provider: new OpenAiCompatProvider(DASHSCOPE_CONFIG) }
    case 'zen':
      return { providerName, provider: gatewayProvider(model, 'zen/', ZEN_CONFIG, ZEN_RESPONSES_CONFIG) }
    case 'zen-go':
      return { providerName, provider: gatewayProvider(model, 'go/', ZEN_GO_CONFIG, ZEN_GO_RESPONSES_CONFIG) }
    case 'antigravity':
      return { providerName, provider: new GeminiCodeAssistProvider({ variant: 'antigravity' }) }
    case 'local':
      return { providerName, provider: new OpenAiCompatProvider(LOCAL_CONFIG) }
    case 'gemini':
      // An explicit GEMINI_API_KEY always wins — it is the unambiguous signal
      // that the caller wants the public API and its own billing. Bare
      // `gemini-*` ids are the PUBLIC namespace; Antigravity's overlapping ids
      // live behind the `antigravity/` prefix above, because the two hosts 404
      // on each other's names.
      if (!process.env['GEMINI_API_KEY'] && getCredential('gemini')?.accessToken) {
        return { providerName, provider: new GeminiCodeAssistProvider() }
      }
      return { providerName, provider: new GeminiProvider({ model }) }
    case 'anthropic':
      return { providerName, provider: new AnthropicProvider() }
  }
}

/**
 * Both opencode hosts split by model family, not by endpoint preference: GPT,
 * Grok and Muse Spark are served on `/responses` and everything else on
 * `/chat/completions`. Verified against both hosts on 2026-09-07 — the same id
 * returns a 500 on the wrong one, so this is routing, not a fallback.
 */
function gatewayProvider(
  model: string,
  prefix: string,
  chatConfig: typeof ZEN_CONFIG,
  responsesConfig: typeof ZEN_RESPONSES_CONFIG,
): Provider {
  const id = model.slice(prefix.length)
  if (/^(gpt-|grok-|muse-spark-)/i.test(id)) return new ResponsesProvider(responsesConfig)
  return new OpenAiCompatProvider(chatConfig)
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

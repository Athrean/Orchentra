import { z } from 'zod'

export const providerIds = ['openai', 'anthropic', 'google', 'openrouter', 'xai', 'groq', 'azure-openai'] as const
export type ProviderId = (typeof providerIds)[number]

export interface ProviderCatalogItem {
  id: ProviderId
  name: string
  description: string
  keyPlaceholder: string
  baseUrlPlaceholder: string
  defaultBaseUrl: string | null
  docsUrl: string
  models: string[]
}

export const providerCatalog: ProviderCatalogItem[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models for general reasoning and coding workflows.',
    keyPlaceholder: 'sk-...',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    defaultBaseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models for long-context analysis and triage.',
    keyPlaceholder: 'sk-ant-...',
    baseUrlPlaceholder: 'https://api.anthropic.com',
    defaultBaseUrl: 'https://api.anthropic.com',
    docsUrl: 'https://console.anthropic.com/',
    models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Gemini models for multimodal and fast analysis flows.',
    keyPlaceholder: 'AIza...',
    baseUrlPlaceholder: 'https://generativelanguage.googleapis.com',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    docsUrl: 'https://aistudio.google.com/apikey',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  },
  {
    id: 'xai',
    name: 'xAI',
    description: 'Grok models from xAI for general reasoning and coding.',
    keyPlaceholder: 'xai-...',
    baseUrlPlaceholder: 'https://api.x.ai/v1',
    defaultBaseUrl: 'https://api.x.ai/v1',
    docsUrl: 'https://console.x.ai/',
    models: ['grok-4', 'grok-3', 'grok-2-1212'],
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Low-latency inference for open-weight models on Groq LPUs.',
    keyPlaceholder: 'gsk_...',
    baseUrlPlaceholder: 'https://api.groq.com/openai/v1',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    docsUrl: 'https://console.groq.com/keys',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    description: 'OpenAI models hosted on your Azure deployment.',
    keyPlaceholder: 'azure key',
    baseUrlPlaceholder: 'https://{resource}.openai.azure.com/openai',
    defaultBaseUrl: null,
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai/',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-4-turbo', 'gpt-35-turbo'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Route requests across multiple hosted model providers.',
    keyPlaceholder: 'sk-or-...',
    baseUrlPlaceholder: 'https://openrouter.ai/api/v1',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    docsUrl: 'https://openrouter.ai/keys',
    models: ['anthropic/claude-sonnet-4-5', 'openai/gpt-4.1', 'google/gemini-2.5-pro'],
  },
]

export const providerIdSchema = z.enum(providerIds)

export function getProviderCatalogItem(provider: ProviderId): ProviderCatalogItem {
  const item = providerCatalog.find((entry) => entry.id === provider)
  if (!item) throw new Error(`Unknown provider: ${provider}`)
  return item
}

export function isCatalogModel(provider: ProviderId, model: string): boolean {
  return getProviderCatalogItem(provider).models.includes(model)
}

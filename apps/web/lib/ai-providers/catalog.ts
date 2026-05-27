import { z } from 'zod'

export const providerIds = ['openai', 'anthropic', 'google', 'openrouter'] as const
export type ProviderId = (typeof providerIds)[number]

export interface ProviderCatalogItem {
  id: ProviderId
  name: string
  description: string
  keyPlaceholder: string
  baseUrlPlaceholder: string
  defaultBaseUrl: string | null
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
    models: ['gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models for long-context analysis and triage.',
    keyPlaceholder: 'sk-ant-...',
    baseUrlPlaceholder: 'https://api.anthropic.com',
    defaultBaseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Gemini models for multimodal and fast analysis flows.',
    keyPlaceholder: 'AIza...',
    baseUrlPlaceholder: 'https://generativelanguage.googleapis.com',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Route requests across multiple hosted model providers.',
    keyPlaceholder: 'sk-or-...',
    baseUrlPlaceholder: 'https://openrouter.ai/api/v1',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
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

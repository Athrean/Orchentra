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
  docsUrl: string
  models: string[]
}

export const providerCatalog: ProviderCatalogItem[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT frontier models for agentic engineering workflows.',
    keyPlaceholder: 'sk-...',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    defaultBaseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude frontier models for long-context analysis and triage.',
    keyPlaceholder: 'sk-ant-...',
    baseUrlPlaceholder: 'https://api.anthropic.com',
    defaultBaseUrl: 'https://api.anthropic.com',
    docsUrl: 'https://console.anthropic.com/',
    models: [
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-sonnet-4-5',
      'claude-opus-4-1',
      'claude-haiku-4-5',
    ],
  },
  {
    id: 'google',
    name: 'Gemini',
    description: 'Gemini frontier models for multimodal and agentic analysis.',
    keyPlaceholder: 'AIza...',
    baseUrlPlaceholder: 'https://generativelanguage.googleapis.com',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    docsUrl: 'https://aistudio.google.com/apikey',
    models: ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Route requests across multiple hosted model providers.',
    keyPlaceholder: 'sk-or-...',
    baseUrlPlaceholder: 'https://openrouter.ai/api/v1',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    docsUrl: 'https://openrouter.ai/keys',
    models: ['anthropic/claude-opus-4-8', 'openai/gpt-5.5', 'google/gemini-3.1-pro-preview'],
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

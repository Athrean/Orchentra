import { getProviderCatalogItem, type ProviderId } from './catalog'

export interface KeyTestResult {
  ok: boolean
  error?: string
  kind?: 'auth' | 'network' | 'provider'
}

interface ValidateProviderKeyInput {
  provider: ProviderId
  apiKey: string
  baseUrl?: string | null
  fetcher?: typeof fetch
}

export async function validateProviderKey(input: ValidateProviderKeyInput): Promise<KeyTestResult> {
  const fetcher = input.fetcher ?? fetch
  const catalogItem = getProviderCatalogItem(input.provider)
  const baseUrl = stripTrailingSlash(input.baseUrl || catalogItem.defaultBaseUrl || '')

  try {
    const response = await fetcher(buildUrl(input.provider, baseUrl, input.apiKey), {
      method: 'GET',
      headers: buildHeaders(input.provider, input.apiKey),
    })

    if (response.ok) return { ok: true }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, kind: 'auth', error: 'Authentication failed for this provider key.' }
    }

    return { ok: false, kind: 'provider', error: `Provider returned ${response.status}.` }
  } catch (err) {
    return {
      ok: false,
      kind: 'network',
      error: err instanceof Error ? err.message : 'Network error while testing key.',
    }
  }
}

function buildUrl(provider: ProviderId, baseUrl: string, apiKey: string): string {
  switch (provider) {
    case 'openai':
    case 'openrouter':
      return `${baseUrl}/models`
    case 'anthropic':
      return `${baseUrl}/v1/models`
    case 'google':
      return `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`
  }
}

function buildHeaders(provider: ProviderId, apiKey: string): Record<string, string> {
  switch (provider) {
    case 'anthropic':
      return {
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      }
    case 'google':
      return {}
    case 'openai':
    case 'openrouter':
      return { Authorization: `Bearer ${apiKey}` }
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

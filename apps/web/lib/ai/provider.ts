import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { profiles } from '../db/schema'
import { decryptSecret } from '../crypto'
import { getProviderCredential, type ProviderCredentialSecret } from '../ai-providers/credential-store'
import { providerIds, type ProviderId } from '../ai-providers/catalog'
import { DEFAULT_MODEL_ID, providerForModel } from './models'

const PROVIDER_PRECEDENCE: ProviderId[] = ['anthropic', 'openai', 'google', 'openrouter']

/**
 * Decide which provider + model to use given the set of configured providers and an
 * optional requested model. Pure so it can be unit-tested without a database.
 */
export function chooseProviderAndModel(
  configured: Partial<Record<ProviderId, { defaultModel: string }>>,
  requestedModel?: string,
): { provider: ProviderId; modelId: string } | null {
  if (requestedModel) {
    const owner = providerForModel(requestedModel)
    if (owner && configured[owner]) return { provider: owner, modelId: requestedModel }
    if (owner) return null
  }

  for (const provider of PROVIDER_PRECEDENCE) {
    const cred = configured[provider]
    if (cred) return { provider, modelId: cred.defaultModel }
  }

  return null
}

function buildLanguageModel(secret: ProviderCredentialSecret, modelId: string): LanguageModel {
  const baseURL = secret.baseUrl ?? undefined
  switch (secret.provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: secret.apiKey, baseURL })(modelId)
    case 'openai':
      return createOpenAI({ apiKey: secret.apiKey, baseURL })(modelId)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: secret.apiKey, baseURL })(modelId)
    case 'openrouter':
      return createOpenRouter({ apiKey: secret.apiKey })(modelId)
  }
}

export type ResolvedChatModel =
  | { ok: true; model: LanguageModel; provider: ProviderId; modelId: string }
  | { ok: false; reason: 'no-key' | 'decrypt-failed' }

/**
 * Resolve a ready-to-use AI SDK language model for a user, honoring stored provider
 * credentials (with a legacy single-key fallback) and an optional requested model.
 */
export async function resolveChatModel(userId: string, requestedModel?: string): Promise<ResolvedChatModel> {
  const secrets = await Promise.all(providerIds.map((provider) => getProviderCredential(userId, provider)))
  const byProvider = new Map<ProviderId, ProviderCredentialSecret>()
  const configured: Partial<Record<ProviderId, { defaultModel: string }>> = {}
  for (const secret of secrets) {
    if (!secret) continue
    byProvider.set(secret.provider, secret)
    configured[secret.provider] = { defaultModel: secret.defaultModel }
  }

  const choice = chooseProviderAndModel(configured, requestedModel)
  if (choice) {
    const secret = byProvider.get(choice.provider)
    if (secret) {
      return {
        ok: true,
        model: buildLanguageModel(secret, choice.modelId),
        provider: choice.provider,
        modelId: choice.modelId,
      }
    }
  }

  // Legacy fallback: a single key stored on the profile.
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)
  if (!profile?.llmKeyEncrypted) return { ok: false, reason: 'no-key' }

  let apiKey: string
  try {
    apiKey = decryptSecret(profile.llmKeyEncrypted)
  } catch {
    return { ok: false, reason: 'decrypt-failed' }
  }

  const provider = (profile.llmProvider ?? 'anthropic') as ProviderId
  const modelId = requestedModel && providerForModel(requestedModel) === provider ? requestedModel : DEFAULT_MODEL_ID
  const secret: ProviderCredentialSecret = { provider, apiKey, baseUrl: null, defaultModel: modelId }
  return { ok: true, model: buildLanguageModel(secret, modelId), provider, modelId }
}

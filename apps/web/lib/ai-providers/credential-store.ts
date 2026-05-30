import { and, eq } from 'drizzle-orm'
import { encryptSecretParts, decryptSecretParts } from '../crypto'
import { db } from '../db/client'
import { providerCredentials } from '../db/schema'
import { getProviderCatalogItem, type ProviderId } from './catalog'

export interface SaveProviderCredentialInput {
  userId: string
  provider: ProviderId
  apiKey: string
  baseUrl?: string | null
  defaultModel: string
}

export interface MaskedProviderCredential {
  provider: ProviderId
  configured: boolean
  baseUrl: string | null
  defaultModel: string
  updatedAt: Date | null
}

export interface ProviderCredentialSecret {
  provider: ProviderId
  apiKey: string
  baseUrl: string | null
  defaultModel: string
}

export async function saveProviderCredential(input: SaveProviderCredentialInput): Promise<void> {
  const encrypted = encryptSecretParts(input.apiKey)
  const now = new Date()

  await db
    .insert(providerCredentials)
    .values({
      userId: input.userId,
      provider: input.provider,
      apiKeyCiphertext: encrypted.ciphertext,
      apiKeyIv: encrypted.iv,
      apiKeyTag: encrypted.tag,
      baseUrl: normalizeOptional(input.baseUrl),
      defaultModel: input.defaultModel,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [providerCredentials.userId, providerCredentials.provider],
      set: {
        apiKeyCiphertext: encrypted.ciphertext,
        apiKeyIv: encrypted.iv,
        apiKeyTag: encrypted.tag,
        baseUrl: normalizeOptional(input.baseUrl),
        defaultModel: input.defaultModel,
        updatedAt: now,
      },
    })
}

export async function getProviderCredential(
  userId: string,
  provider: ProviderId,
): Promise<ProviderCredentialSecret | null> {
  const [row] = await db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.provider, provider)))
    .limit(1)

  if (!row) return null

  return {
    provider,
    apiKey: decryptSecretParts({
      ciphertext: row.apiKeyCiphertext,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    }),
    baseUrl: row.baseUrl,
    defaultModel: row.defaultModel,
  }
}

export async function listMaskedProviderCredentials(userId: string): Promise<MaskedProviderCredential[]> {
  const rows = await db.select().from(providerCredentials).where(eq(providerCredentials.userId, userId))
  const byProvider = new Map(rows.map((row) => [row.provider, row]))

  return (['openai', 'anthropic', 'google', 'openrouter'] as const).map((provider) => {
    const row = byProvider.get(provider)
    const catalogItem = getProviderCatalogItem(provider)

    return {
      provider,
      configured: Boolean(row),
      baseUrl: row?.baseUrl ?? catalogItem.defaultBaseUrl,
      defaultModel: row?.defaultModel ?? catalogItem.models[0],
      updatedAt: row?.updatedAt ?? null,
    }
  })
}

export async function deleteProviderCredential(userId: string, provider: ProviderId): Promise<void> {
  await db
    .delete(providerCredentials)
    .where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.provider, provider)))
}

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

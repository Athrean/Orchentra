import { eq } from 'drizzle-orm'
import { db, orgLlmConfigs } from '../db/client'
import { encryptSecret, decryptSecret } from './crypto'

export type LlmProvider = 'openrouter' | 'anthropic' | 'openai' | 'custom'

export interface ResolvedLlmConfig {
  provider: LlmProvider
  modelId: string
  apiKey: string | null
  baseUrl: string | null
}

export interface OrgLlmConfigInput {
  provider: LlmProvider
  modelId: string
  apiKey?: string | null
  baseUrl?: string | null
}

export const SUPPORTED_PROVIDERS: readonly LlmProvider[] = ['openrouter', 'anthropic', 'openai', 'custom'] as const

export async function getOrgLlmConfig(orgId: string): Promise<ResolvedLlmConfig | null> {
  const [row] = await db.select().from(orgLlmConfigs).where(eq(orgLlmConfigs.orgId, orgId)).limit(1)
  if (!row) return null

  let apiKey: string | null = null
  if (row.apiKeyCiphertext && row.apiKeyIv && row.apiKeyTag) {
    apiKey = decryptSecret({
      ciphertext: row.apiKeyCiphertext,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    })
  }

  return {
    provider: row.provider as LlmProvider,
    modelId: row.modelId,
    apiKey,
    baseUrl: row.baseUrl,
  }
}

export async function upsertOrgLlmConfig(orgId: string, input: OrgLlmConfigInput): Promise<void> {
  const baseValues = {
    orgId,
    provider: input.provider,
    modelId: input.modelId,
    baseUrl: input.baseUrl ?? null,
    updatedAt: new Date(),
  }

  let cipher: ReturnType<typeof encryptSecret> | null = null
  if (input.apiKey && input.apiKey.length > 0) {
    cipher = encryptSecret(input.apiKey)
  }

  // Update path retains the existing ciphertext when no new key is provided.
  const updateValues =
    cipher !== null
      ? {
          ...baseValues,
          apiKeyCiphertext: cipher.ciphertext,
          apiKeyIv: cipher.iv,
          apiKeyTag: cipher.tag,
        }
      : baseValues

  const insertValues = {
    id: crypto.randomUUID(),
    ...baseValues,
    apiKeyCiphertext: cipher?.ciphertext ?? null,
    apiKeyIv: cipher?.iv ?? null,
    apiKeyTag: cipher?.tag ?? null,
  }

  await db.insert(orgLlmConfigs).values(insertValues).onConflictDoUpdate({
    target: orgLlmConfigs.orgId,
    set: updateValues,
  })
}

export async function deleteOrgLlmConfig(orgId: string): Promise<void> {
  await db.delete(orgLlmConfigs).where(eq(orgLlmConfigs.orgId, orgId))
}

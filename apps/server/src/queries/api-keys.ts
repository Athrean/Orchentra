import { eq } from 'drizzle-orm'
import { db, apiKeys } from '../db/client'

interface ApiKeyListRow {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

export async function getUserApiKeys(userId: string): Promise<ApiKeyListRow[]> {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
}

export async function insertApiKey(values: {
  id: string
  userId: string
  name: string
  keyHash: string
  keyPrefix: string
  expiresAt: Date | null
}): Promise<void> {
  await db.insert(apiKeys).values(values)
}

export async function findApiKeyById(keyId: string): Promise<typeof apiKeys.$inferSelect | null> {
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1)
  return row ?? null
}

export async function deleteApiKey(keyId: string): Promise<void> {
  await db.delete(apiKeys).where(eq(apiKeys.id, keyId))
}

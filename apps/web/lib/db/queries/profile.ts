import { eq } from 'drizzle-orm'
import { db } from '../client'
import { profiles } from '../schema'

export async function getProfile(userId: string) {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)
  return row ?? null
}

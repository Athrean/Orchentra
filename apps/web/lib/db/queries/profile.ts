import { eq } from 'drizzle-orm'
import { db } from '../client'
import { profiles } from '../schema'
import type { ProfileEdit } from '../../validators/profile'

export async function getProfile(userId: string) {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)
  return row ?? null
}

export async function updateProfile(userId: string, patch: ProfileEdit) {
  const [row] = await db
    .update(profiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(profiles.id, userId))
    .returning()
  return row
}

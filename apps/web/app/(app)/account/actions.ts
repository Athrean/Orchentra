'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../../../lib/db/client'
import { profiles } from '../../../lib/db/schema'
import { createClient } from '../../../lib/supabase/server'
import { encryptSecret } from '../../../lib/crypto'
import { llmKeySchema, profileEditSchema, type ProfileEdit, type LlmKey } from '../../../lib/validators/profile'

async function requireUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export async function saveProfile(input: ProfileEdit) {
  const parsed = profileEditSchema.parse(input)
  const userId = await requireUserId()
  await db
    .update(profiles)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(profiles.id, userId))
  revalidatePath('/settings/profile')
}

export async function setAccountPassword(password: string) {
  if (password.length < 8) throw new Error('Password must be at least 8 characters')
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(error.message)
}

export async function saveLlmKey(input: LlmKey) {
  const parsed = llmKeySchema.parse(input)
  const userId = await requireUserId()
  const encrypted = encryptSecret(parsed.apiKey)
  await db
    .update(profiles)
    .set({
      llmProvider: parsed.llmProvider,
      llmKeyEncrypted: encrypted,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, userId))
  revalidatePath('/settings/ai-providers')
}

export async function clearLlmKey() {
  const userId = await requireUserId()
  await db.update(profiles).set({ llmKeyEncrypted: null, updatedAt: new Date() }).where(eq(profiles.id, userId))
  revalidatePath('/settings/ai-providers')
}

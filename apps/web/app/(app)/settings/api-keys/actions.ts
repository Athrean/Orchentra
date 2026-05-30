'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../../lib/db/client'
import { projectApiKeys } from '../../../../lib/db/schema'
import { createClient } from '../../../../lib/supabase/server'
import {
  generateProjectApiToken,
  hashProjectApiToken,
  tokenDisplayPrefix,
} from '../../../../lib/api-keys/project-api-keys'

const createKeySchema = z.object({ name: z.string().min(1).max(80) })

async function requireUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export async function createProjectApiKey(input: z.input<typeof createKeySchema>) {
  const parsed = createKeySchema.parse(input)
  const userId = await requireUserId()
  const token = generateProjectApiToken()

  await db.insert(projectApiKeys).values({
    userId,
    name: parsed.name,
    tokenHash: hashProjectApiToken(token),
    tokenPrefix: tokenDisplayPrefix(token),
  })

  revalidatePath('/settings/api-keys')
  return { token }
}

export async function revokeProjectApiKey(id: string) {
  const userId = await requireUserId()
  await db
    .update(projectApiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(projectApiKeys.userId, userId), eq(projectApiKeys.id, id)))
  revalidatePath('/settings/api-keys')
}

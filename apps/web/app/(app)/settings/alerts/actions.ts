'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../../lib/db/client'
import { alertRules } from '../../../../lib/db/schema'
import { createClient } from '../../../../lib/supabase/server'

const alertRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  signal: z.string().min(1).max(80),
  comparator: z.enum(['>', '>=', '<', '<=', '=']),
  threshold: z.string().min(1).max(80),
  enabled: z.boolean().default(true),
})

async function requireUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export async function saveAlertRule(input: z.input<typeof alertRuleSchema>) {
  const parsed = alertRuleSchema.parse(input)
  const userId = await requireUserId()

  if (parsed.id) {
    await db
      .update(alertRules)
      .set({
        name: parsed.name,
        signal: parsed.signal,
        comparator: parsed.comparator,
        threshold: parsed.threshold,
        enabled: parsed.enabled,
        updatedAt: new Date(),
      })
      .where(and(eq(alertRules.userId, userId), eq(alertRules.id, parsed.id)))
  } else {
    await db.insert(alertRules).values({ userId, ...parsed })
  }

  revalidatePath('/settings/alerts')
}

export async function deleteAlertRule(id: string) {
  const userId = await requireUserId()
  await db.delete(alertRules).where(and(eq(alertRules.userId, userId), eq(alertRules.id, id)))
  revalidatePath('/settings/alerts')
}

'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '../../../../lib/db/client'
import { notificationPrefs } from '../../../../lib/db/schema'
import { createClient } from '../../../../lib/supabase/server'

const channelPrefsSchema = z.record(
  z.string(),
  z.object({ inApp: z.boolean(), slack: z.boolean(), email: z.boolean() }),
)
const notificationPrefsSchema = z.object({
  prefs: channelPrefsSchema,
  slackDm: z.boolean(),
  quietHoursStart: z.string().max(5).optional(),
  quietHoursEnd: z.string().max(5).optional(),
})

async function requireUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export async function saveNotificationPrefs(input: z.input<typeof notificationPrefsSchema>) {
  const parsed = notificationPrefsSchema.parse(input)
  const userId = await requireUserId()
  await db
    .insert(notificationPrefs)
    .values({
      userId,
      prefs: parsed.prefs,
      slackDm: parsed.slackDm,
      quietHoursStart: parsed.quietHoursStart || null,
      quietHoursEnd: parsed.quietHoursEnd || null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: notificationPrefs.userId,
      set: {
        prefs: parsed.prefs,
        slackDm: parsed.slackDm,
        quietHoursStart: parsed.quietHoursStart || null,
        quietHoursEnd: parsed.quietHoursEnd || null,
        updatedAt: new Date(),
      },
    })
  revalidatePath('/settings/notifications')
}

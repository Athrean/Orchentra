import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '../../../../lib/db/client'
import { notificationPrefs } from '../../../../lib/db/schema'
import { createClient } from '../../../../lib/supabase/server'
import { NotificationsPanel } from '../../../../components/pd/settings/NotificationsPanel'
import { SettingsSection } from '../../../../components/pd/settings/SettingsSection'

export const metadata = { title: 'Notifications · Orchentra' }

export default async function SettingsNotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [prefs] = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, user.id)).limit(1)

  return (
    <SettingsSection
      title="Notifications"
      description="Choose delivery channels, Slack DM behavior, and quiet hours. Delivery is configured separately."
    >
      <NotificationsPanel
        initialPrefs={
          (prefs?.prefs as Record<string, { inApp: boolean; slack: boolean; email: boolean }> | undefined) ?? {}
        }
        initialSlackDm={prefs?.slackDm ?? false}
        initialQuietStart={prefs?.quietHoursStart ?? ''}
        initialQuietEnd={prefs?.quietHoursEnd ?? ''}
      />
    </SettingsSection>
  )
}

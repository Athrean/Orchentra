import { desc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '../../../../lib/db/client'
import { alertHistory, alertRules } from '../../../../lib/db/schema'
import { createClient } from '../../../../lib/supabase/server'
import { AlertsPanel } from '../../../../components/pd/settings/AlertsPanel'
import { SettingsSection } from '../../../../components/pd/settings/SettingsSection'

export const metadata = { title: 'Alerts · Orchentra' }

export default async function SettingsAlertsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [rules, history] = await Promise.all([
    db.select().from(alertRules).where(eq(alertRules.userId, user.id)).orderBy(desc(alertRules.createdAt)),
    db.select().from(alertHistory).where(eq(alertHistory.userId, user.id)).orderBy(desc(alertHistory.firedAt)),
  ])

  return (
    <SettingsSection
      title="Alerts"
      description="Create and review alert rules for operational signals. Firing and delivery are intentionally out of scope here."
    >
      <AlertsPanel rules={rules} history={history} />
    </SettingsSection>
  )
}

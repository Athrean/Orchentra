import { desc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '../../../../lib/db/client'
import { projectApiKeys } from '../../../../lib/db/schema'
import { createClient } from '../../../../lib/supabase/server'
import { ApiKeysPanel } from '../../../../components/pd/settings/ApiKeysPanel'
import { SettingsSection } from '../../../../components/pd/settings/SettingsSection'

export const metadata = { title: 'API keys · Orchentra' }

export default async function SettingsApiKeysPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const keys = await db
    .select()
    .from(projectApiKeys)
    .where(eq(projectApiKeys.userId, user.id))
    .orderBy(desc(projectApiKeys.createdAt))

  return (
    <SettingsSection
      title="API Keys"
      description="Generate and revoke project API keys for automation. Plaintext tokens are shown once and only hashes are stored."
    >
      <ApiKeysPanel keys={keys} />
    </SettingsSection>
  )
}

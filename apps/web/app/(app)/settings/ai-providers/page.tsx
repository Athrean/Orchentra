import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase/server'
import { SettingsSection } from '../../../../components/pd/settings/SettingsSection'
import { AiProvidersTable } from '../../../../components/pd/settings/AiProvidersTable'
import { listMaskedProviderCredentials } from '../../../../lib/ai-providers/credential-store'

export const metadata = { title: 'AI providers · Orchentra' }

export default async function SettingsAiProvidersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const credentials = await listMaskedProviderCredentials(user.id)

  return (
    <SettingsSection title="AI Providers" description="Manage personal provider credentials and model defaults.">
      <AiProvidersTable credentials={credentials} />
    </SettingsSection>
  )
}

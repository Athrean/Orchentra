import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase/server'
import { getProfile } from '../../../../lib/db/queries/profile'
import { ProfileForm } from '../../../../components/pd/account/ProfileForm'
import { SettingsSection } from '../../../../components/pd/settings/SettingsSection'

export const metadata = { title: 'Profile settings · Orchentra' }

export default async function SettingsProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  const hasEmailIdentity = user.identities?.some((identity) => identity.provider === 'email') ?? false
  const authMethod = user.app_metadata?.provider ?? user.identities?.[0]?.provider ?? null

  return (
    <SettingsSection title="Profile Settings" description="Manage your personal information and account preferences.">
      <ProfileForm
        initial={{
          fullName: profile?.fullName ?? null,
          username: profile?.username ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
        }}
        email={user.email ?? null}
        emailVerified={Boolean(user.email_confirmed_at)}
        canSetPassword={!hasEmailIdentity}
        userId={user.id}
        createdAt={user.created_at ?? null}
        authMethod={authMethod}
      />
    </SettingsSection>
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase/server'
import { getProfile } from '../../../../lib/db/queries/profile'
import { ProfileForm } from '../../../../components/pd/account/ProfileForm'
import { SettingsSection } from '../../../../components/pd/settings/SettingsSection'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/pd/ui/card'

export const metadata = { title: 'Profile settings · Orchentra' }

export default async function SettingsProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  const hasEmailIdentity = user.identities?.some((identity) => identity.provider === 'email') ?? false

  return (
    <SettingsSection title="Profile" description="Control how your account appears across Orchentra.">
      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>Update your display name, username, and avatar URL.</CardDescription>
        </CardHeader>
        <CardContent>
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
          />
        </CardContent>
      </Card>
    </SettingsSection>
  )
}

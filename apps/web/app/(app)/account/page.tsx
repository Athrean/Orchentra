import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { getProfile } from '../../../lib/db/queries/profile'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/pd/ui/card'
import { ProfileForm } from '../../../components/pd/account/ProfileForm'
import { LlmKeyForm } from '../../../components/pd/account/LlmKeyForm'

export const metadata = { title: 'Account · Orchentra' }

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  const provider: 'anthropic' | 'openai' = profile?.llmProvider === 'openai' ? 'openai' : 'anthropic'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--color-pd-text)]">Account</h2>
        <p className="text-sm text-[var(--color-pd-text-muted)]">Signed in as {user.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How you appear inside Orchentra.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initial={{
              fullName: profile?.fullName ?? null,
              username: profile?.username ?? null,
              avatarUrl: profile?.avatarUrl ?? null,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>LLM key</CardTitle>
          <CardDescription>
            Bring your own Anthropic or OpenAI key. Stored encrypted, used only for your requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LlmKeyForm provider={provider} hasKey={Boolean(profile?.llmKeyEncrypted)} />
        </CardContent>
      </Card>
    </div>
  )
}

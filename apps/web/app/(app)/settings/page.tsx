import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { getProfile } from '../../../lib/db/queries/profile'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/pd/ui/card'
import { ProfileForm } from '../../../components/pd/account/ProfileForm'
import { LlmKeyForm } from '../../../components/pd/account/LlmKeyForm'

export const metadata = { title: 'Settings · Orchentra' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  const provider: 'anthropic' | 'openai' = profile?.llmProvider === 'openai' ? 'openai' : 'anthropic'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-8 pb-12">
      <header className="pt-8">
        <h1 className="text-2xl font-semibold tracking-tight text-pg-text-0">Settings</h1>
        <p className="mt-1 text-sm text-pg-text-mute">Manage your profile, devices, and personal model credentials.</p>
      </header>

      <nav className="flex gap-2 text-sm">
        <span className="rounded-[8px] bg-pg-text-0 px-3 py-1.5 text-white">Profile settings</span>
        <Link
          href="/settings/devices"
          className="rounded-[8px] px-3 py-1.5 text-pg-text-mute hover:bg-pg-surface-1 hover:text-pg-text-0"
        >
          CLI devices
        </Link>
      </nav>

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

import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { AppSidebar } from '../../components/pd/shell/AppSidebar'
import { Topbar } from '../../components/pd/shell/Topbar'
import { getProfile } from '../../lib/db/queries/profile'
import { getOnboardingState } from '../../lib/db/queries/onboarding'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const onboarding = await getOnboardingState(user.id).catch(() => null)
  if (!onboarding?.completedAt) redirect('/onboarding')

  const profile = await getProfile(user.id).catch(() => null)
  const fullName = profile?.fullName ?? (user.user_metadata?.full_name as string | undefined) ?? null
  const avatarUrl = profile?.avatarUrl ?? (user.user_metadata?.avatar_url as string | undefined) ?? null

  return (
    <div className="flex h-screen">
      <AppSidebar email={user.email} fullName={fullName} avatarUrl={avatarUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar email={user.email} fullName={fullName} avatarUrl={avatarUrl} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

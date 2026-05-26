import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { getOrCreateOnboardingState } from '../../../lib/db/queries/onboarding'
import { OnboardingShell } from '../../../components/pd/onboarding/OnboardingShell'

export const metadata = { title: 'Get started · Orchentra' }
export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/onboarding')

  const state = await getOrCreateOnboardingState(user.id)
  if (state.completedAt) redirect('/dashboard')

  return <OnboardingShell initialStep={state.step as 'welcome' | 'install_app' | 'select_repos'} />
}

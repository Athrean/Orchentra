import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { InvestigateHero } from '../../../components/pd/dashboard/InvestigateHero'

export const metadata = { title: 'Investigate · Orchentra' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <InvestigateHero />
}

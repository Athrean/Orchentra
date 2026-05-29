import { CalendarClock } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { FeatureLanding } from '../../../components/pd/shell/FeatureLanding'

export const metadata = { title: 'Evals · Orchentra' }
export const dynamic = 'force-dynamic'

export default async function CronsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <FeatureLanding
      icon={CalendarClock}
      title="Evals"
      description="Scheduled checks, benchmark runs, and evaluation history will live here as first-class execution nodes."
    />
  )
}

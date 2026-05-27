import { CalendarClock } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { FeatureLanding } from '../../../components/pd/shell/FeatureLanding'

export const metadata = { title: 'Schedules · Orchentra' }
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
      title="Schedules"
      description="Cron-driven operations and their run history will live here — every scheduled execution as a first-class node on the graph."
    />
  )
}

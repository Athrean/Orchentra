import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { CoworkSurface } from '../../../components/pd/workspace/CoworkSurface'

export const metadata = { title: 'Investigate · Orchentra' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <CoworkSurface />
}

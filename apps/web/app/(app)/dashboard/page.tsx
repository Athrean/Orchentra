import { Clock, Zap } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { StatTile } from '../../../components/pd/dashboard/StatTile'
import { ExecutionsLineChart } from '../../../components/pd/dashboard/charts/ExecutionsLineChart'
import { MttrBarChart } from '../../../components/pd/dashboard/charts/MttrBarChart'
import { type ActivityRow, RecentActivityTable } from '../../../components/pd/dashboard/RecentActivityTable'

export const metadata = { title: 'Overview · Orchentra' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // TODO(slice E): replace with real db query against executions table
  const rows: ActivityRow[] = []

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatTile title="Executions (30d)" value="0" delta={{ dir: 'up', pct: 0 }} filter="30 days" icon={Zap}>
          <ExecutionsLineChart />
        </StatTile>
        <StatTile title="MTTR (median)" value="—" filter="7 days" icon={Clock}>
          <MttrBarChart />
        </StatTile>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-light/60">Recent activity</h2>
        <RecentActivityTable rows={rows} />
      </div>
    </div>
  )
}

import { redirect } from 'next/navigation'
import { Activity, BarChart3, Workflow } from 'lucide-react'
import { createClient } from '../../../lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/pd/ui/card'

export const metadata = { title: 'Overview · Orchentra' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-light">Overview</h2>
        <p className="text-sm text-light/70">Signed in as {user.email}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard icon={<Activity className="h-4 w-4" />} label="Executions" value="0" />
        <StatCard icon={<Workflow className="h-4 w-4" />} label="Monitored repos" value="0" />
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label="LLM cost (30d)" value="$0.00" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-light/70">
          Nothing yet. Connect a repo to start observing pipeline failures.
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-light/70">{label}</CardTitle>
        <span className="text-light/40">{icon}</span>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="text-2xl font-semibold tracking-tight text-light">{value}</div>
      </CardContent>
    </Card>
  )
}

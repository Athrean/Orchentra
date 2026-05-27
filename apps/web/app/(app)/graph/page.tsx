import { Workflow } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { FeatureLanding } from '../../../components/pd/shell/FeatureLanding'

export const metadata = { title: 'Graph · Orchentra' }
export const dynamic = 'force-dynamic'

export default async function GraphPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <FeatureLanding
      icon={Workflow}
      title="Observability graph"
      description="A live view of the execution graph — every run and its nodes, traced end to end across CLI, MCP, and webhook surfaces."
    />
  )
}

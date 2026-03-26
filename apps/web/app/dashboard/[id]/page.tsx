import { IncidentsDashboard } from '../../../components/IncidentsDashboard'

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <IncidentsDashboard repo={decodeURIComponent(id)} />
}

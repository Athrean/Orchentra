import { IncidentsDashboard } from '../../../components/IncidentsDashboard'

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let repo: string
  try {
    repo = decodeURIComponent(id)
  } catch {
    return <div className="p-6 text-red-400">Invalid repository identifier.</div>
  }
  return <IncidentsDashboard repo={repo} />
}

import { AnalyticsDashboard } from '../../../../components/dashboard/AnalyticsDashboard'

export default async function MonitoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let repo: string
  try {
    repo = decodeURIComponent(id)
  } catch {
    return <div className="p-6 text-red-400">Invalid repository identifier.</div>
  }
  return <AnalyticsDashboard repo={repo} />
}

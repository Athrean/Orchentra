export default async function MonitoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let repo: string
  try {
    repo = decodeURIComponent(id)
  } catch {
    return <div className="p-6 text-red-400">Invalid repository identifier.</div>
  }
  // Analytics dashboard — implemented in feat/86-monitoring
  return (
    <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
      Analytics for <strong className="mx-1">{repo}</strong> — coming soon
    </div>
  )
}

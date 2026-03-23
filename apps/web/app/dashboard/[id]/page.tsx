export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
  const { id } = await params

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-medium">Incident {id}</h1>
      {/* TODO: Phase 3 — incident detail + trace view */}
    </div>
  )
}

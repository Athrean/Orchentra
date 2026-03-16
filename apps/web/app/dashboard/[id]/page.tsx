export default function IncidentDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-medium">Incident {params.id}</h1>
      {/* TODO: Phase 3 — incident detail + trace view */}
    </div>
  )
}

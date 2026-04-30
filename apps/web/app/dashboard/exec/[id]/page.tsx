import { ExecutionPage } from '../../../../components/dashboard/ExecutionPage'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let executionId: string
  try {
    executionId = decodeURIComponent(id)
  } catch {
    return <div className="p-6 text-red-400">Invalid execution identifier.</div>
  }
  return <ExecutionPage executionId={executionId} />
}

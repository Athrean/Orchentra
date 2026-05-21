import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ExecutionDetail, Shell } from '../../../../components/dashboard-v2'
import { getApiBase, getLoginUrl } from '../../../lib/get-login-url'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let executionId: string
  try {
    executionId = decodeURIComponent(id)
  } catch {
    return <div className="p-6 text-red-400">Invalid execution identifier.</div>
  }

  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')
  if (!session?.value) redirect(getLoginUrl())
  const apiBase = getApiBase()
  const res = await fetch(`${apiBase}/api/me`, {
    headers: { Cookie: `orchentra_session=${session.value}` },
    cache: 'no-store',
  })
  if (!res.ok) redirect(getLoginUrl())
  const data = (await res.json()) as { org?: { name?: string } }
  const orgName = data.org?.name ?? ''

  return (
    <Shell orgName={orgName}>
      <ExecutionDetail executionId={executionId} />
    </Shell>
  )
}

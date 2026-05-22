import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ExecutionsList, Shell } from '../../components/dashboard-v2'
import { getApiBase, getLoginUrl } from '../lib/get-login-url'

export default async function Page(): Promise<React.ReactNode> {
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
      <ExecutionsList />
    </Shell>
  )
}

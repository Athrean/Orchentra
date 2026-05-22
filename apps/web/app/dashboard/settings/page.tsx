import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Shell } from '../../../components/dashboard-v2'
import { getApiBase, getLoginUrl } from '../../lib/get-login-url'

export default async function Page(): Promise<React.ReactNode> {
  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')
  if (!session?.value) redirect(getLoginUrl())
  const res = await fetch(`${getApiBase()}/api/me`, {
    headers: { Cookie: `orchentra_session=${session.value}` },
    cache: 'no-store',
  })
  if (!res.ok) redirect(getLoginUrl())
  const data = (await res.json()) as { org?: { name?: string } }
  const orgName = data.org?.name ?? ''

  return (
    <Shell orgName={orgName}>
      <div className="px-8 py-6 font-mono">
        <h1 className="text-base font-semibold text-[var(--color-pg-text-0)]">settings</h1>
        <p className="mt-2 text-xs text-[var(--color-pg-text-mute)]">org configuration · placeholder</p>
      </div>
    </Shell>
  )
}

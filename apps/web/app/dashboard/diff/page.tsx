import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CrossExecDiff, Shell } from '../../../components/dashboard-v2'
import { getApiBase, getLoginUrl } from '../../lib/get-login-url'

export default async function Page({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams
  if (!a || !b) {
    return (
      <div className="p-6 font-mono text-sm text-[var(--color-status-error)]">
        Provide both `a` and `b` execution ids: /dashboard/diff?a=&lt;id&gt;&b=&lt;id&gt;.
      </div>
    )
  }

  let aId: string
  let bId: string
  try {
    aId = decodeURIComponent(a)
    bId = decodeURIComponent(b)
  } catch {
    return <div className="p-6 font-mono text-sm text-[var(--color-status-error)]">Invalid execution identifier.</div>
  }
  if (aId === bId) {
    return <div className="p-6 font-mono text-sm text-[var(--color-status-error)]">`a` and `b` must differ.</div>
  }

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
      <CrossExecDiff a={aId} b={bId} />
    </Shell>
  )
}

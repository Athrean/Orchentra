// apps/web/app/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DitherGrid, ExecutionGraphDemo, FeatureTriptych, Hero } from '../components/marketing-v2'
import { getApiBase, getLoginUrl } from './lib/get-login-url'

export default async function Page(): Promise<React.ReactNode> {
  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')

  let authed = false
  if (session?.value) {
    const apiBase = getApiBase()
    try {
      const res = await fetch(`${apiBase}/api/me`, {
        headers: { Cookie: `orchentra_session=${session.value}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = (await res.json()) as { org?: { id?: string } }
        authed = Boolean(data.org?.id)
      }
    } catch {
      // Network error — fall through to marketing
    }
  }
  if (authed) redirect('/onboarding')

  const loginUrl = getLoginUrl()

  return (
    <main className="relative min-h-screen text-[var(--color-pg-text-0)] font-mono">
      <DitherGrid />
      <Hero loginHref={loginUrl} />
      <ExecutionGraphDemo />
      <FeatureTriptych />
    </main>
  )
}

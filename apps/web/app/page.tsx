import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ConnectorGrid, CoralCTA, FeatureGrid, Footer, Hero, HowItWorks, TopNav } from '../components/marketing'
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
    <main className="mk-canvas min-h-screen">
      <TopNav loginHref={loginUrl} />
      <Hero loginHref={loginUrl} />
      <FeatureGrid />
      <HowItWorks />
      <ConnectorGrid />
      <CoralCTA loginHref={loginUrl} />
      <Footer />
    </main>
  )
}

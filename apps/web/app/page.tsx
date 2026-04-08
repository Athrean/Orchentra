import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getApiBase } from './lib/get-login-url'
import {
  Nav,
  HeroSection,
  ValuePropSection,
  CapabilitiesSection,
  ProductDemoSection,
  UseCasesSection,
  CTABanner,
  ResourcesSection,
  Footer,
} from './components/landing'

export default async function Page(): Promise<React.ReactNode> {
  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')

  if (session?.value) {
    const apiBase = getApiBase()
    let shouldRedirect = false
    try {
      const res = await fetch(`${apiBase}/api/me`, {
        headers: { Cookie: `orchentra_session=${session.value}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = (await res.json()) as { org?: { id?: string } }
        if (data.org?.id) shouldRedirect = true
      }
    } catch {
      // Network error — fall through to landing page
    }
    if (shouldRedirect) redirect('/onboarding')
  }

  return (
    <div className="min-h-screen bg-cream">
      <Nav />
      <main>
        <HeroSection />
        <ValuePropSection />
        <CapabilitiesSection />
        <ProductDemoSection />
        <UseCasesSection />
        <CTABanner />
        <ResourcesSection />
      </main>
      <Footer />
    </div>
  )
}

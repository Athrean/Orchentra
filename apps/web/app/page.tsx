import { redirect } from 'next/navigation'
import {
  ASCIIBackground,
  BuildingBlocks,
  ExecutionsTable,
  FAQ,
  Footer,
  Hero,
  LiveGraphCard,
  NavBar,
  PillarFeatures,
  Testimonials,
} from '../components/marketing-v2'
import { createClient } from '../lib/supabase/server'
import pkg from '../package.json'

export default async function Page(): Promise<React.ReactNode> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const loginUrl = '/login'

  return (
    <main className="relative min-h-screen text-[var(--color-pg-text-0)]">
      <ASCIIBackground />
      <NavBar loginHref={loginUrl} />
      <Hero loginHref={loginUrl} />
      <PillarFeatures />
      <LiveGraphCard />
      <ExecutionsTable />
      <BuildingBlocks />
      <Testimonials />
      <FAQ />
      <Footer loginHref={loginUrl} version={pkg.version} />
    </main>
  )
}

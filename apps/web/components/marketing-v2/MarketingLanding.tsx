'use client'

import * as React from 'react'
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
} from './index'
import { LoginModal } from '../pd/auth/LoginModal'

interface MarketingLandingProps {
  loginHref: string
  version: string
}

export function MarketingLanding({ loginHref, version }: MarketingLandingProps) {
  const [open, setOpen] = React.useState(false)
  const openLogin = React.useCallback(() => setOpen(true), [])

  return (
    <main className="relative min-h-screen text-[var(--color-pg-text-0)]">
      <ASCIIBackground />
      <NavBar loginHref={loginHref} onLogin={openLogin} />
      <Hero loginHref={loginHref} onLogin={openLogin} />
      <PillarFeatures />
      <LiveGraphCard />
      <ExecutionsTable />
      <BuildingBlocks />
      <Testimonials />
      <FAQ />
      <Footer loginHref={loginHref} version={version} onLogin={openLogin} />
      <LoginModal open={open} onOpenChange={setOpen} />
    </main>
  )
}

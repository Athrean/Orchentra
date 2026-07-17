'use client'

import { SpecialistCarousel } from './crew'
import { Hero } from './hero'
import { Footer, InstallCTA } from './install-footer'
import { MotionProvider } from './motion'
import { MetricsSection, QuickstartSection, ReasonGrid, RunSection, SiteHeader, WorkflowSection } from './sections'

export function LandingPage(): React.ReactNode {
  return (
    <MotionProvider>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <QuickstartSection />
        <RunSection />
        <ReasonGrid />
        <SpecialistCarousel />
        <WorkflowSection />
        <MetricsSection />
        <InstallCTA />
      </main>
      <Footer />
    </MotionProvider>
  )
}

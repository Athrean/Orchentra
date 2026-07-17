'use client'

import { SpecialistCarousel } from './crew'
import { Hero } from './hero'
import { Footer, InstallCTA } from './install-footer'
import { MotionProvider } from './motion'
import { BenefitGrid, CapabilityGrid, FaqSection, ProofMosaic, SiteRail, WorkflowSection } from './sections'

export function LandingPage(): React.ReactNode {
  return (
    <MotionProvider>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteRail />
      <div className="page-canvas">
        <main id="main-content">
          <Hero />
          <BenefitGrid />
          <SpecialistCarousel />
          <ProofMosaic />
          <WorkflowSection />
          <CapabilityGrid />
          <InstallCTA />
          <FaqSection />
        </main>
        <Footer />
      </div>
    </MotionProvider>
  )
}

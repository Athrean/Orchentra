'use client'

import { SpecialistCarousel } from './crew'
import { Hero } from './hero'
import { Footer, InstallCTA } from './install-footer'
import { MotionProvider } from './motion'
import { BenefitGrid, CapabilityGrid, FaqSection, ProofMosaic, SiteRail, WorkflowSection } from './sections'

export function LandingPage(): React.ReactNode {
  return (
    <MotionProvider>
      <SiteRail />
      <div className="page-canvas">
        <main>
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

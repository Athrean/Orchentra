'use client'

import { Hero } from './hero'
import { FinalCTA, Footer } from './install-footer'
import { MotionProvider } from './motion'
import {
  CapabilitySection,
  FaqSection,
  LifecycleSection,
  ModelSection,
  MotiveSection,
  PlaygroundSection,
  PricingSection,
  PrinciplesSection,
  ProblemSection,
  SetupSection,
  SiteHeader,
} from './sections'

export function LandingPage(): React.ReactNode {
  return (
    <MotionProvider>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <MotiveSection />
        <ProblemSection />
        <CapabilitySection />
        <PlaygroundSection />
        <ModelSection />
        <SetupSection />
        <LifecycleSection />
        <PricingSection />
        <PrinciplesSection />
        <FaqSection />
        <FinalCTA />
      </main>
      <Footer />
    </MotionProvider>
  )
}

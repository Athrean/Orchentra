import type { Metadata } from 'next'
import { ContactForm } from '../components/contact-form'
import { Footer } from '../components/landing/install-footer'
import { MotionProvider, Reveal } from '../components/landing/motion'
import { SiteHeader } from '../components/landing/sections'

export const metadata: Metadata = {
  title: 'Contact Athrean Lab',
  description: 'Talk with Athrean Lab about Orchentra, the accountable coding harness.',
}

export default function ContactPage(): React.ReactNode {
  return (
    <MotionProvider>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteHeader />
      <main className="contact-page" id="main-content">
        <div className="site-rail contact-layout">
          <Reveal className="contact-intro">
            <p className="eyebrow eyebrow--light">CONTACT ATHREAN LAB</p>
            <h1>
              Let’s make
              <br />
              coding runs
              <br />
              <em>accountable.</em>
            </h1>
            <p>
              Questions about Orchentra, a team workflow, or the open-source roadmap? Tell us what you are trying to
              prove.
            </p>
          </Reveal>
          <Reveal className="contact-form-wrap" delay={0.12}>
            <ContactForm />
          </Reveal>
        </div>
      </main>
      <Footer />
    </MotionProvider>
  )
}

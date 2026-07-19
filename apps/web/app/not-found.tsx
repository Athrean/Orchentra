import { Footer } from './components/landing/install-footer'
import { MotionProvider, HeroReveal } from './components/landing/motion'
import { SiteHeader } from './components/landing/sections'
import { CornerButton } from './components/landing/ui'

export default function NotFound(): React.ReactNode {
  return (
    <MotionProvider>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteHeader />
      <main className="not-found-page" id="main-content">
        <div className="site-rail not-found-inner">
          <div className="technical-texture" aria-hidden="true">
            <span className="texture-orbit texture-orbit--one" />
            <span className="texture-orbit texture-orbit--two" />
          </div>
          <HeroReveal className="not-found-copy" delay={0.2}>
            <p className="eyebrow eyebrow--light">ERROR / 404</p>
            <h1>
              Wrong branch.
              <br />
              Clear way back.
            </h1>
            <p>This route is not part of the current run. Return to the Orchentra system overview.</p>
            <CornerButton href="/">BACK TO HOME</CornerButton>
          </HeroReveal>
          <span className="error-code" aria-hidden="true">
            404
          </span>
        </div>
      </main>
      <Footer />
    </MotionProvider>
  )
}

import { GITHUB_URL } from './data'
import { HeroReveal } from './motion'
import { CornerButton } from './ui'
import { OrchentraTerminal } from './visuals'

export function Hero(): React.ReactNode {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="site-rail hero-rail">
        <div className="hero-field">
          <div className="technical-texture" aria-hidden="true">
            <span className="texture-orbit texture-orbit--one" />
            <span className="texture-orbit texture-orbit--two" />
            <span className="texture-cross texture-cross--one">+</span>
            <span className="texture-cross texture-cross--two">+</span>
            <span className="texture-code">RUN / 00108</span>
          </div>
          <HeroReveal className="hero-copy" delay={0.4}>
            <p className="eyebrow eyebrow--light">THE ACCOUNTABLE CODING HARNESS</p>
            <h1 id="hero-title">
              Ship code with
              <br />
              proof attached.
            </h1>
            <p>
              Orchentra coordinates the models, specialist agents, checks, and browser work behind one verifiable coding
              run.
            </p>
            <div className="hero-actions">
              <CornerButton href="#install">INSTALL ORCHENTRA</CornerButton>
              <a href={GITHUB_URL} className="text-link" target="_blank" rel="noreferrer">
                VIEW SOURCE <span>↗</span>
              </a>
            </div>
          </HeroReveal>
        </div>
        <HeroReveal className="hero-dashboard" delay={0.6} duration={1.5}>
          <OrchentraTerminal scenario="run" variant="hero" />
        </HeroReveal>
      </div>
    </section>
  )
}

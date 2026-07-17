import { m, type Variants } from 'framer-motion'
import Image from 'next/image'
import { GITHUB_URL } from './data'
import { revealItem, softSpring } from './motion'

const heroSequence: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.05, staggerChildren: 0.09 } },
}

const titleLine: Variants = {
  hidden: { y: '110%' },
  visible: { y: 0, transition: { ...softSpring, stiffness: 120, damping: 20 } },
}

export function Hero(): React.ReactNode {
  return (
    <m.section
      className="hero"
      id="top"
      aria-labelledby="hero-title"
      initial="hidden"
      animate="visible"
      variants={heroSequence}
    >
      <div className="section-frame">
        <div className="hero-field">
          <Image
            className="hero-background"
            src="/orch-back.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 1280px) 100vw, 1280px"
          />
          <span className="hero-scrim" aria-hidden="true" />

          <div className="hero-content">
            <m.p className="hero-note" variants={revealItem}>
              Local-first coding orchestration · Open source
            </m.p>
            <m.h1 id="hero-title" variants={heroSequence}>
              <span>
                <m.span variants={titleLine}>Give every coding run</m.span>
              </span>
              <span>
                <m.span variants={titleLine}>a finish line.</m.span>
              </span>
            </m.h1>
            <m.p className="hero-intro" variants={revealItem}>
              Orchentra plans the work, coordinates specialist agents, runs the real checks, and returns the evidence
              behind the result.
            </m.p>
            <m.div className="button-row hero-actions" variants={revealItem}>
              <a className="button button--hero" href="#install">
                Install Orchentra
              </a>
              <a className="button button--ghost" href={GITHUB_URL}>
                View source ↗
              </a>
            </m.div>
          </div>
        </div>
      </div>
    </m.section>
  )
}

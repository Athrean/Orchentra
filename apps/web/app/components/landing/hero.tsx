import { m, useReducedMotion, useScroll, useSpring, useTransform, type Variants } from 'framer-motion'
import { useRef } from 'react'
import { GITHUB_URL } from './data'
import { FieldZone } from './field-zone'
import { revealItem, softSpring } from './motion'
import { Logo } from './ui'

const heroSequence: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.08, staggerChildren: 0.11 } },
}

const titleLine: Variants = {
  hidden: { y: '110%' },
  visible: { y: 0, transition: { ...softSpring, stiffness: 125, damping: 20 } },
}

export function Hero(): React.ReactNode {
  const sectionRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] })
  const headerOffset = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : -26])
  const headerY = useSpring(headerOffset, { stiffness: 130, damping: 28, mass: 0.7 })

  return (
    <m.section
      ref={sectionRef}
      className="hero"
      id="top"
      aria-labelledby="hero-title"
      initial="hidden"
      animate="visible"
      variants={heroSequence}
    >
      <m.a className="corner-link" href={GITHUB_URL} variants={revealItem} whileHover={{ y: -2 }}>
        View GitHub{' '}
        <m.span aria-hidden="true" whileHover={{ x: 2, y: -2 }}>
          ↗
        </m.span>
      </m.a>

      <m.header className="hero-header" style={{ y: headerY }}>
        <div className="hero-header-grid">
          <m.h1 id="hero-title" className="hero-title pixel-type" variants={heroSequence}>
            <span>
              <m.span variants={titleLine}>Code,</m.span>
            </span>
            <span>
              <m.span variants={titleLine}>orchestrated.</m.span>
            </span>
          </m.h1>

          <m.div className="hero-side" variants={revealItem}>
            <p className="hero-descriptor">
              <span>A CLI-first coding crew</span>
              <span>for real repositories</span>
            </p>

            <div className="hero-side-bottom">
              <a href="#top" aria-label="Orchentra home" className="brand-lockup">
                <Logo size={36} />
                <span>Orchentra</span>
              </a>
              <p>Spends less. Writes less. Proves its review by running the code.</p>
            </div>

            <nav className="hero-nav" aria-label="Main navigation">
              <a href="#crew">Crew</a>
              <a href="#spine">Spine</a>
              <a href="#agents">Agents</a>
              <a href="#install">Install</a>
            </nav>
          </m.div>
        </div>
      </m.header>

      <div className="hero-stage" aria-hidden="true">
        <FieldZone variant="hero" />
      </div>
    </m.section>
  )
}

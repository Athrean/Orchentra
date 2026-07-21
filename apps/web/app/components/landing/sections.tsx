'use client'

import { AnimatePresence, m, useMotionValueEvent, useScroll } from 'framer-motion'
import Link from 'next/link'
import { useRef, useState } from 'react'
import {
  GITHUB_URL,
  comparison,
  capabilities,
  faq,
  lifecycle,
  plans,
  principles,
  referenceEase,
  setupSteps,
} from './data'
import { Reveal } from './motion'
import { Brand, CornerButton, Glyph } from './ui'
import { OrchentraTerminal, type TerminalScenario } from './visuals'

const headerLinks = [
  ['WHY', '/#problem'],
  ['CAPABILITIES', '/#capabilities'],
  ['WORKFLOW', '/#workflow'],
  ['PRICING', '/#pricing'],
] as const

export function SiteHeader(): React.ReactNode {
  const [open, setOpen] = useState(false)

  return (
    <header className={open ? 'site-header is-open' : 'site-header'}>
      <div className="site-rail header-inner">
        <Link className="site-brand" href="/" aria-label="Orchentra home" onClick={() => setOpen(false)}>
          <Brand />
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {headerLinks.map(([label, href]) => (
            <a href={href} key={label}>
              {label}
            </a>
          ))}
        </nav>
        <a className="header-cta" href={GITHUB_URL} target="_blank" rel="noreferrer">
          GITHUB <span>↗</span>
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <m.nav
            id="mobile-nav"
            className="mobile-nav site-rail"
            aria-label="Mobile navigation"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.76, ease: referenceEase }}
          >
            <div>
              {headerLinks.map(([label, href], index) => (
                <a href={href} key={label} onClick={() => setOpen(false)}>
                  <span>0{index + 1}</span>
                  {label}
                  <b>↗</b>
                </a>
              ))}
              <Link href="/contact" onClick={() => setOpen(false)}>
                <span>05</span>CONTACT<b>↗</b>
              </Link>
            </div>
          </m.nav>
        ) : null}
      </AnimatePresence>
    </header>
  )
}

export function MotiveSection(): React.ReactNode {
  return (
    <section className="motive ruled-section" aria-labelledby="motive-title">
      <div className="site-rail motive-inner">
        <Reveal>
          <p className="eyebrow">THE MOTIVE</p>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 id="motive-title">
            Models can write code. Orchentra makes the entire run <em>accountable.</em>
          </h2>
        </Reveal>
      </div>
    </section>
  )
}

export function ProblemSection(): React.ReactNode {
  return (
    <section className="problem ruled-section" id="problem" aria-labelledby="problem-title">
      <div className="site-rail problem-inner">
        <Reveal className="section-heading section-heading--center">
          <p className="eyebrow">THE PROBLEM</p>
          <h2 id="problem-title">
            A capable model is not
            <br />
            an accountable system.
          </h2>
          <p>Without a harness, execution, delegation, and proof drift apart.</p>
        </Reveal>
        <div className="comparison-grid">
          <Reveal className="comparison-card comparison-card--muted">
            <div className="comparison-title">
              <span>×</span>
              <strong>WITHOUT ORCHENTRA</strong>
            </div>
            <ul>
              {comparison.without.map((item) => (
                <li key={item}>
                  <span>×</span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="comparison-card comparison-card--green" delay={0.08}>
            <div className="comparison-title">
              <span>✓</span>
              <strong>WITH ORCHENTRA</strong>
            </div>
            <ul>
              {comparison.with.map((item) => (
                <li key={item}>
                  <span>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export function CapabilitySection(): React.ReactNode {
  return (
    <section className="capability ruled-section" id="capabilities" aria-labelledby="capability-title">
      <div className="site-rail capability-inner">
        <Reveal className="section-heading section-heading--center">
          <p className="eyebrow">THE SYSTEM</p>
          <h2 id="capability-title">
            Everything required to turn
            <br />a request into verified work.
          </h2>
        </Reveal>
        <div className="capability-grid">
          {capabilities.slice(0, 3).map((item, index) => (
            <CapabilityCard item={item} key={item.title} index={index} />
          ))}
          <Reveal className="capability-core" delay={0.05}>
            <div className="technical-texture" aria-hidden="true">
              <span className="texture-orbit texture-orbit--one" />
              <span className="texture-orbit texture-orbit--two" />
            </div>
            <OrchentraTerminal scenario="run" variant="core" />
            <div className="capability-core-copy">
              <p className="eyebrow eyebrow--light">ONE ACCOUNTABLE RUN</p>
              <h3>Launch a coding crew in minutes.</h3>
            </div>
          </Reveal>
          {capabilities.slice(3).map((item, index) => (
            <CapabilityCard item={item} key={item.title} index={index + 3} />
          ))}
        </div>
      </div>
    </section>
  )
}

function CapabilityCard({ item, index }: { item: (typeof capabilities)[number]; index: number }): React.ReactNode {
  return (
    <Reveal className={`capability-card capability-card--${index + 1}`} delay={(index % 3) * 0.04}>
      <span className="capability-icon">
        <Glyph name={item.icon} />
      </span>
      <span className="capability-index">0{index + 1}</span>
      <div>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
      </div>
    </Reveal>
  )
}

export function PlaygroundSection(): React.ReactNode {
  return (
    <section className="split-feature ruled-section" aria-labelledby="playground-title">
      <div className="site-rail split-feature-inner">
        <Reveal className="feature-copy">
          <p className="eyebrow">OUTCOME FIRST</p>
          <h2 id="playground-title">Describe the finish line, not every keystroke.</h2>
          <p>
            Orchentra reads the repository, selects a bounded execution path, and keeps the completion contract attached
            to the work.
          </p>
          <a className="arrow-link" href="#workflow">
            SEE THE WORKFLOW <span>↗</span>
          </a>
        </Reveal>
        <Reveal className="feature-visual feature-visual--command" delay={0.08}>
          <OrchentraTerminal scenario="outcome" variant="feature" />
        </Reveal>
      </div>
    </section>
  )
}

export function ModelSection(): React.ReactNode {
  return (
    <section className="split-feature ruled-section split-feature--reverse" aria-labelledby="model-title">
      <div className="site-rail split-feature-inner">
        <Reveal className="feature-visual feature-visual--provider">
          <OrchentraTerminal scenario="models" variant="feature" />
        </Reveal>
        <Reveal className="feature-copy" delay={0.08}>
          <p className="eyebrow">MODEL AWARE</p>
          <h2 id="model-title">One standard of proof. Provider-specific execution.</h2>
          <p>
            Prompt structure, edit behavior, tools, and continuation adapt to the model family without changing what
            “complete” means.
          </p>
          <div className="feature-stat">
            <strong>BYOK</strong>
            <span>
              YOUR MODELS.
              <br />
              YOUR PROVIDER KEYS.
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function SetupSection(): React.ReactNode {
  const sectionRef = useRef<HTMLElement>(null)
  const [activeStep, setActiveStep] = useState(0)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start 70%', 'end 70%'] })

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    const nextStep = latest < 0.34 ? 0 : latest < 0.67 ? 1 : 2
    setActiveStep((current) => (current === nextStep ? current : nextStep))
  })

  function relayState(segment: number): 'is-complete' | 'is-active' | 'is-upcoming' {
    if (segment < activeStep) return 'is-complete'
    if (segment === activeStep) return 'is-active'
    return 'is-upcoming'
  }

  return (
    <section className="setup ruled-section" id="workflow" aria-labelledby="setup-title" ref={sectionRef}>
      <div className="site-rail setup-inner">
        <Reveal className="section-heading section-heading--center">
          <p className="eyebrow">QUICK START</p>
          <h2 id="setup-title">
            From install to evidence
            <br />
            in three clear moves.
          </h2>
        </Reveal>
        <div className="setup-steps">
          {setupSteps.map((step, index) => {
            const stepState = index < activeStep ? 'is-complete' : index === activeStep ? 'is-active' : 'is-upcoming'

            return (
              <Reveal className={`setup-step ${stepState}`} key={step.index} amount={0.5}>
                <div className="setup-step-index">
                  {index > 0 ? (
                    <i className={`setup-relay setup-relay--in ${relayState(index - 1)}`} aria-hidden="true" />
                  ) : null}
                  <span>{step.index}</span>
                  {index < setupSteps.length - 1 ? (
                    <i className={`setup-relay setup-relay--out ${relayState(index)}`} aria-hidden="true" />
                  ) : null}
                  <small>{step.short}</small>
                </div>
                <div className="setup-step-copy">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
                <div className="setup-step-visual">
                  <OrchentraTerminal
                    scenario={index === 0 ? 'install' : index === 1 ? 'outcome' : 'verify'}
                    variant="compact"
                  />
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function LifecycleSection(): React.ReactNode {
  const [active, setActive] = useState(0)
  const item = lifecycle[active]

  return (
    <section className="lifecycle ruled-section" aria-labelledby="lifecycle-title">
      <div className="site-rail lifecycle-inner">
        <Reveal className="section-heading section-heading--center">
          <p className="eyebrow">THE RUN LIFECYCLE</p>
          <h2 id="lifecycle-title">
            Every stage visible.
            <br />
            Every handoff explicit.
          </h2>
        </Reveal>
        <Reveal className="lifecycle-shell">
          <div className="lifecycle-tabs" role="tablist" aria-label="Run stages">
            {lifecycle.map((entry, index) => (
              <button
                type="button"
                role="tab"
                aria-selected={index === active}
                aria-controls={`panel-${entry.id}`}
                id={`tab-${entry.id}`}
                key={entry.id}
                onClick={() => setActive(index)}
              >
                <span>0{index + 1}</span>
                {entry.label}
                <i>+</i>
              </button>
            ))}
          </div>
          <div className="lifecycle-panel" id={`panel-${item.id}`} role="tabpanel" aria-labelledby={`tab-${item.id}`}>
            <AnimatePresence mode="wait">
              <m.div
                className="lifecycle-panel-inner"
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.44, ease: referenceEase }}
              >
                <div className="lifecycle-copy">
                  <span>
                    <Glyph name={item.icon} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
                <LifecycleVisual index={active} />
              </m.div>
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

const lifecycleScenarios: readonly TerminalScenario[] = ['inspect', 'plan', 'build', 'verify']

function LifecycleVisual({ index }: { index: number }): React.ReactNode {
  const scenario = lifecycleScenarios[index]
  return <OrchentraTerminal key={scenario} scenario={scenario} variant="compact" />
}

export function PricingSection(): React.ReactNode {
  const [annual, setAnnual] = useState(true)

  return (
    <section className="pricing ruled-section" id="pricing" aria-labelledby="pricing-title">
      <div className="site-rail pricing-inner">
        <Reveal className="section-heading section-heading--center">
          <p className="eyebrow">CLEAR FROM DAY ONE</p>
          <h2 id="pricing-title">
            Open source at the core.
            <br />
            No usage tax from us.
          </h2>
          <div className="billing-toggle">
            <span className={!annual ? 'is-active' : ''}>TODAY</span>
            <button
              type="button"
              aria-pressed={annual}
              aria-label="Show roadmap plan"
              onClick={() => setAnnual((value) => !value)}
            >
              <m.i animate={{ x: annual ? 22 : 0 }} transition={{ duration: 0.3 }} />
            </button>
            <span className={annual ? 'is-active' : ''}>ROADMAP</span>
          </div>
        </Reveal>
        <div className="pricing-grid">
          {plans.map((plan, index) => (
            <Reveal
              className={plan.popular ? 'price-card is-featured' : 'price-card'}
              key={plan.name}
              delay={index * 0.08}
            >
              {plan.popular ? <span className="price-badge">PLANNED</span> : null}
              <p className="price-audience">{plan.audience}</p>
              <h3>{plan.name}</h3>
              <div className="price">
                <strong>{plan.price}</strong>
                <span>{plan.suffix}</span>
              </div>
              <p className="price-body">{plan.body}</p>
              <ul>
                {plan.features.map(([feature, included]) => (
                  <li key={feature} className={included ? '' : 'is-muted'}>
                    <span>{included ? '✓' : '—'}</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <CornerButton href={plan.href} external={plan.href.startsWith('http')}>
                {plan.cta.toUpperCase()}
              </CornerButton>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function PrinciplesSection(): React.ReactNode {
  return (
    <section className="principles ruled-section" aria-labelledby="principles-title">
      <div className="site-rail principles-inner">
        <Reveal className="section-heading section-heading--center">
          <p className="eyebrow">BUILT ON CONTRACTS</p>
          <h2 id="principles-title">
            Trust comes from
            <br />
            how the system behaves.
          </h2>
        </Reveal>
        <div className="principle-grid">
          {principles.map((principle, index) => (
            <Reveal className="principle-card" key={principle.title} delay={(index % 3) * 0.04}>
              <span className="principle-mark">“</span>
              <blockquote>{principle.quote}</blockquote>
              <div>
                <i>0{index + 1}</i>
                <p>
                  <strong>{principle.title}</strong>
                  <span>{principle.role}</span>
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function FaqSection(): React.ReactNode {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section className="faq ruled-section" aria-labelledby="faq-title">
      <div className="site-rail faq-inner">
        <Reveal className="section-heading section-heading--center">
          <p className="eyebrow">COMMON QUESTIONS</p>
          <h2 id="faq-title">Before your first run.</h2>
        </Reveal>
        <div className="faq-list">
          {faq.map((item, index) => {
            const expanded = open === index
            return (
              <Reveal className="faq-item" key={item.question} delay={(index % 3) * 0.03}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`faq-answer-${index}`}
                  onClick={() => setOpen(expanded ? null : index)}
                >
                  <span>{item.question}</span>
                  <m.i animate={{ rotate: expanded ? 45 : 0 }} transition={{ duration: 0.32 }}>
                    +
                  </m.i>
                </button>
                <AnimatePresence initial={false}>
                  {expanded ? (
                    <m.div
                      id={`faq-answer-${index}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.42, ease: referenceEase }}
                    >
                      <p>{item.answer}</p>
                    </m.div>
                  ) : null}
                </AnimatePresence>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

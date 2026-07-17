import { m } from 'framer-motion'
import { capabilities, faqs, GITHUB_URL, reasons, workflow } from './data'
import { Reveal, revealItem, stagger } from './motion'
import { Logo } from './ui'

export function SiteRail(): React.ReactNode {
  return (
    <aside className="site-rail" aria-label="Site navigation">
      <a href="#top" className="rail-brand" aria-label="Orchentra home">
        <Logo size={27} />
        <span>Orchentra</span>
      </a>
      <nav className="rail-nav" aria-label="Primary navigation">
        <a href="#why">Why</a>
        <a href="#crew">Crew</a>
        <a href="#workflow">Workflow</a>
        <a href="#capabilities">Capabilities</a>
        <a href="#install">Install</a>
      </nav>
      <div className="rail-meta">
        <a href={GITHUB_URL}>GitHub ↗</a>
        <p>Orchentra by Athrean Lab</p>
      </div>
    </aside>
  )
}

export function BenefitGrid(): React.ReactNode {
  return (
    <section className="benefits section-pad" id="why" aria-labelledby="why-title">
      <div className="section-frame">
        <Reveal className="section-heading">
          <p className="eyebrow">Why Orchentra</p>
          <h2 id="why-title">
            Fast code is common.
            <span>Accountable execution isn’t.</span>
          </h2>
        </Reveal>
        <m.div
          className="benefit-grid"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.18 }}
          variants={stagger}
        >
          {reasons.map((reason, index) => (
            <m.article className="benefit-item" key={reason.title} variants={revealItem}>
              <ProductGlyph type={reason.glyph} index={index} />
              <h3>{reason.title}</h3>
              <p>{reason.body}</p>
            </m.article>
          ))}
        </m.div>
      </div>
    </section>
  )
}

function ProductGlyph({ type, index }: { type: string; index: number }): React.ReactNode {
  return (
    <div className={`product-glyph product-glyph--${type}`} aria-hidden="true">
      <span className="glyph-axis" />
      <span className="glyph-node glyph-node--a" />
      <span className="glyph-node glyph-node--b" />
      <span className="glyph-node glyph-node--c" />
      <span className="glyph-index">0{index + 1}</span>
    </div>
  )
}

export function ProofMosaic(): React.ReactNode {
  return (
    <section className="proof section-pad" aria-labelledby="proof-title">
      <div className="section-frame">
        <Reveal className="section-heading section-heading--actions">
          <div>
            <p className="eyebrow">Built for completion</p>
            <h2 id="proof-title">
              The output is not the answer.
              <span>The evidence is.</span>
            </h2>
          </div>
          <a className="button button--dark" href="#install">
            Install the harness
          </a>
        </Reveal>
        <div className="proof-mosaic">
          <Reveal className="proof-card proof-card--one">
            <strong>0</strong>
            <p>hosted workspaces required to run against your repository.</p>
          </Reveal>
          <Reveal className="proof-card proof-card--two" delay={0.05}>
            <strong>1</strong>
            <p>live budget inherited by every delegated child.</p>
          </Reveal>
          <Reveal className="proof-card proof-card--three" delay={0.1}>
            <strong>4</strong>
            <p>active roles can coordinate without hiding spend or state.</p>
          </Reveal>
          <Reveal className="proof-card proof-card--inverse" delay={0.15}>
            <div className="proof-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <blockquote>“Done” is a state the checks can grant—not a tone the model can adopt.</blockquote>
            <p>THE ORCHENTRA COMPLETION CONTRACT</p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export function WorkflowSection(): React.ReactNode {
  return (
    <section className="workflow section-pad" id="workflow" aria-labelledby="workflow-title">
      <div className="section-frame">
        <Reveal className="section-heading">
          <p className="eyebrow">One accountable loop</p>
          <h2 id="workflow-title">
            From task to proof.
            <span>Without leaving the repository.</span>
          </h2>
        </Reveal>
        <m.ol
          className="workflow-tabs"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={stagger}
        >
          {workflow.map((step) => (
            <m.li key={step.index} variants={revealItem}>
              <span>{step.index}</span>
              <strong>{step.title}</strong>
            </m.li>
          ))}
        </m.ol>
        <div className="workflow-feature">
          <Reveal className="trace-window">
            <div className="trace-bar">
              <span>run/orchentra</span>
              <span>evidence live</span>
            </div>
            <div className="trace-body" aria-label="Example verification trace">
              <div className="trace-row">
                <span>01</span>
                <strong>inspect</strong>
                <em>repository mapped</em>
              </div>
              <div className="trace-row">
                <span>02</span>
                <strong>edit</strong>
                <em>3 files · 1 vertical slice</em>
              </div>
              <div className="trace-row">
                <span>03</span>
                <strong>test</strong>
                <em>266 files · green</em>
              </div>
              <div className="trace-row trace-row--selected">
                <span>04</span>
                <strong>browser</strong>
                <em>rendered flow verified</em>
              </div>
              <div className="trace-gate">
                <span>completion gate</span>
                <strong>PASS</strong>
              </div>
            </div>
          </Reveal>
          <Reveal className="workflow-copy" delay={0.08}>
            <span className="workflow-index">04 / PROVE</span>
            <h3>The repository gets the final vote.</h3>
            <p>{workflow[3].body}</p>
            <a href={GITHUB_URL}>Read the source ↗</a>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export function CapabilityGrid(): React.ReactNode {
  return (
    <section className="capabilities section-pad" id="capabilities" aria-labelledby="capabilities-title">
      <div className="section-frame">
        <Reveal className="section-heading">
          <p className="eyebrow">Inside the harness</p>
          <h2 id="capabilities-title">
            Control surfaces for real work.
            <span>Not a bigger chat box.</span>
          </h2>
        </Reveal>
        <div className="capability-grid">
          {capabilities.map((capability) => (
            <Reveal className={`capability-item capability-item--${capability.visual}`} key={capability.title}>
              <div className="capability-visual" aria-hidden="true">
                <span className="capability-line capability-line--a" />
                <span className="capability-line capability-line--b" />
                <span className="capability-line capability-line--c" />
                <span className="capability-core">{capability.index}</span>
              </div>
              <div className="capability-copy">
                <span>{capability.index}</span>
                <h3>{capability.title}</h3>
                <p>{capability.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function FaqSection(): React.ReactNode {
  return (
    <section className="faq section-pad" id="faq" aria-labelledby="faq-title">
      <div className="section-frame faq-grid">
        <Reveal className="section-heading">
          <p className="eyebrow">The practical questions</p>
          <h2 id="faq-title">
            Clear by design.
            <span>Local by default.</span>
          </h2>
        </Reveal>
        <div className="faq-list">
          {faqs.map((item, index) => (
            <Reveal key={item.question} delay={index * 0.025}>
              <details open={index === 0}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

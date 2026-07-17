import { m } from 'framer-motion'
import { GITHUB_URL, INSTALL_COMMAND, LICENSE_URL, reasons, runMetrics, workflow } from './data'
import { ModelRail } from './model-rail'
import { Reveal, revealItem, stagger } from './motion'
import { CopyCommand, Logo } from './ui'

export function SiteHeader(): React.ReactNode {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a href="#top" className="site-brand" aria-label="Orchentra home">
          <Logo size={30} />
          <span>Orchentra</span>
        </a>
        <nav className="header-nav" aria-label="Primary navigation">
          <a href="#run">Product</a>
          <a href="#crew">Crew</a>
          <a href="#workflow">Workflow</a>
          <a href="#install">Install</a>
        </nav>
        <a className="header-github" href={GITHUB_URL}>
          GitHub ↗
        </a>
      </div>
    </header>
  )
}

export function QuickstartSection(): React.ReactNode {
  return (
    <section className="quickstart ruled-section" aria-labelledby="quickstart-title">
      <div className="section-frame quickstart-frame">
        <Reveal className="quickstart-copy">
          <p className="eyebrow">Orchentra CLI</p>
          <h2 id="quickstart-title">Start in the repository.</h2>
          <CopyCommand command={INSTALL_COMMAND} />
          <p className="license-line">
            Local-first · Open source · <a href={LICENSE_URL}>Apache-2.0</a>
          </p>
        </Reveal>
      </div>
      <ModelRail />
    </section>
  )
}

export function RunSection(): React.ReactNode {
  return (
    <section className="run-section ruled-section" id="run" aria-labelledby="run-title">
      <div className="section-frame">
        <Reveal className="centered-intro">
          <p className="eyebrow">One accountable run</p>
          <h2 id="run-title">See the work that produced the answer.</h2>
          <p>
            Follow the plan, delegated tasks, changed files, checks, and completion decision without reconstructing the
            story from chat.
          </p>
        </Reveal>

        <Reveal className="run-window">
          <div className="run-window-bar">
            <span className="run-window-brand">
              <Logo size={17} />
              Run trace
            </span>
            <span>feat/dashboard-filter</span>
            <span>main</span>
          </div>
          <div className="run-window-toolbar">
            <span>Task</span>
            <strong>Add keyboard navigation to the filter panel</strong>
            <span className="run-state">In verification</span>
          </div>
          <div className="run-table" role="table" aria-label="Example Orchentra run trace">
            <div className="run-table-row run-table-head" role="row">
              <span role="columnheader">Stage</span>
              <span role="columnheader">Owner</span>
              <span role="columnheader">Result</span>
              <span role="columnheader">State</span>
            </div>
            <div className="run-table-row" role="row">
              <span role="cell">Inspect repository</span>
              <span role="cell">Explorer</span>
              <span role="cell">12 conventions · 3 checks</span>
              <strong role="cell">Done</strong>
            </div>
            <div className="run-table-row" role="row">
              <span role="cell">Choose implementation</span>
              <span role="cell">Architect</span>
              <span role="cell">1 bounded plan</span>
              <strong role="cell">Done</strong>
            </div>
            <div className="run-table-row" role="row">
              <span role="cell">Build interaction</span>
              <span role="cell">Senior developer</span>
              <span role="cell">4 files · 1 slice</span>
              <strong role="cell">Done</strong>
            </div>
            <div className="run-table-row run-table-row--active" role="row">
              <span role="cell">Verify behavior</span>
              <span role="cell">Verifier</span>
              <span role="cell">Tests + keyboard flow</span>
              <strong role="cell">Running</strong>
            </div>
          </div>
          <div className="run-window-foot">
            <span>4 stages · 7 tool calls · 1 active gate</span>
            <strong>Completion waits for evidence</strong>
          </div>
        </Reveal>

        <div className="paired-feature-grid">
          <Reveal className="paired-feature">
            <div className="mini-trace" aria-hidden="true">
              <span className="mini-line mini-line--one" />
              <span className="mini-line mini-line--two" />
              <span className="mini-line mini-line--three" />
              <strong>1</strong>
              <em>shared ceiling</em>
            </div>
            <div className="paired-copy">
              <h3>Budget stays attached to the work.</h3>
              <p>
                Every delegated child draws from the same live token, step, and spend limits. Parallel work cannot hide
                its real cost.
              </p>
            </div>
          </Reveal>
          <Reveal className="paired-feature" delay={0.06}>
            <div className="mini-receipt" aria-hidden="true">
              <span>TYPECHECK</span>
              <strong>PASS</strong>
              <span>TEST</span>
              <strong>PASS</strong>
              <span>BROWSER</span>
              <strong>PASS</strong>
            </div>
            <div className="paired-copy">
              <h3>Evidence ships with the result.</h3>
              <p>
                The final response points back to the checks, browser state, and failure receipts that decided whether
                the task could close.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export function ReasonGrid(): React.ReactNode {
  return (
    <section className="reason-section ruled-section" id="why" aria-labelledby="reason-title">
      <div className="section-frame">
        <Reveal className="centered-intro centered-intro--compact">
          <p className="eyebrow">Why the harness exists</p>
          <h2 id="reason-title">A coding agent should not grade its own work.</h2>
          <p>Orchentra separates execution from proof, then keeps both inside the same local run.</p>
        </Reveal>
        <m.div
          className="reason-grid"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          {reasons.map((reason, index) => (
            <m.article key={reason.question} variants={revealItem}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p className="reason-question">“{reason.question}”</p>
              <h3>{reason.title}</h3>
              <p>{reason.body}</p>
            </m.article>
          ))}
        </m.div>
      </div>
    </section>
  )
}

export function WorkflowSection(): React.ReactNode {
  return (
    <section className="workflow-section ruled-section" id="workflow" aria-labelledby="workflow-title">
      <div className="section-frame">
        <Reveal className="centered-intro">
          <p className="eyebrow">The execution path</p>
          <h2 id="workflow-title">From request to proof in four explicit stages.</h2>
          <p>
            Order matters here: understand the repository, define the contract, do the work, then let the checks decide.
          </p>
        </Reveal>
        <div className="workflow-grid">
          {workflow.map((step, index) => (
            <Reveal className="workflow-card" key={step.index} delay={(index % 2) * 0.05}>
              <div className="terminal-frame" aria-hidden="true">
                <div className="terminal-bar">
                  <span>~</span>
                  <span>stage {step.index}</span>
                </div>
                <code>&gt; {step.command}</code>
                <div className="terminal-lines">
                  <span />
                  <span />
                  <span />
                </div>
                <strong>{index === 3 ? 'EVIDENCE READY' : 'STAGE COMPLETE'}</strong>
              </div>
              <div className="workflow-copy">
                <span>{step.index}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function MetricsSection(): React.ReactNode {
  return (
    <section className="metrics-section ruled-section" aria-label="Orchentra product facts">
      <div className="section-frame metrics-grid">
        {runMetrics.map((metric) => (
          <Reveal className="metric-cell" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

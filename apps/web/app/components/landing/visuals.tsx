import { Brand, Glyph, Logo } from './ui'

const traceRows = [
  ['Inspect repository', 'Explorer', 'Complete'],
  ['Define contract', 'Architect', 'Complete'],
  ['Build the change', 'Developer', 'Complete'],
  ['Verify behavior', 'Verifier', 'Running'],
] as const

export function WorkspaceMockup({ compact = false }: { compact?: boolean }): React.ReactNode {
  return (
    <div
      className={compact ? 'workspace workspace--compact' : 'workspace'}
      aria-label="Example Orchentra run workspace"
    >
      <aside className="workspace-sidebar">
        <Brand compact />
        <div className="workspace-menu" aria-hidden="true">
          <span className="is-current">
            <Glyph name="flow" /> Runs
          </span>
          <span>
            <Glyph name="agents" /> Crew
          </span>
          <span>
            <Glyph name="context" /> Traces
          </span>
          <span>
            <Glyph name="model" /> Models
          </span>
        </div>
        <div className="workspace-repo">
          <small>REPOSITORY</small>
          <strong>orchentra/web</strong>
          <span>feat/landing-system</span>
        </div>
      </aside>

      <div className="workspace-main">
        <div className="workspace-bar">
          <span className="workspace-trail">
            <Logo size={14} /> Runs / <strong>#108</strong>
          </span>
          <span className="workspace-status">
            <i /> In progress
          </span>
        </div>
        <div className="workspace-tabs" aria-hidden="true">
          <span className="is-current">Run trace</span>
          <span>Changed files</span>
          <span>Evidence</span>
        </div>
        <div className="workspace-content">
          <div className="workspace-task">
            <span>OUTCOME</span>
            <strong>Rebuild the landing page and prove every responsive state</strong>
            <p>Respect repository decisions, preserve the product truth, and operate the final page in Chromium.</p>
          </div>
          <div className="workspace-table">
            <div className="workspace-table-head">
              <span>Stage</span>
              <span>Owner</span>
              <span>State</span>
            </div>
            {traceRows.map(([stage, owner, state], index) => (
              <div className={index === 3 ? 'workspace-row is-active' : 'workspace-row'} key={stage}>
                <span>
                  <i>{index < 3 ? '✓' : '↗'}</i>
                  {stage}
                </span>
                <span>{owner}</span>
                <strong>{state}</strong>
              </div>
            ))}
          </div>
          <div className="workspace-log">
            <span>
              <i /> Browser verification
            </span>
            <code>1440 × 1024 · no console errors · 6 assertions passed</code>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CommandPanel(): React.ReactNode {
  return (
    <div className="command-panel" aria-label="Example outcome prompt">
      <div className="command-panel-head">
        <Brand compact />
        <span>NEW RUN</span>
      </div>
      <div className="command-compose">
        <p>Build the account settings flow, cover the edge cases, and verify the result in the browser.</p>
        <div>
          <span>Repository aware</span>
          <span>Browser enabled</span>
          <button type="button" tabIndex={-1}>
            Run ↗
          </button>
        </div>
      </div>
      <div className="command-suggestions">
        <small>TRY AN OUTCOME</small>
        <span>
          Refactor a subsystem across isolated worktrees <b>↗</b>
        </span>
        <span>
          Find the regression and close it with evidence <b>↗</b>
        </span>
      </div>
    </div>
  )
}

export function ProviderPanel(): React.ReactNode {
  return (
    <div className="provider-panel" aria-label="Model profile configuration example">
      <div className="provider-head">
        <Brand compact />
        <span>MODEL PROFILE</span>
      </div>
      <div className="provider-title">
        <i className="provider-orb" />
        <div>
          <small>ACTIVE PROVIDER</small>
          <strong>Model-aware execution</strong>
        </div>
        <span>Ready</span>
      </div>
      <div className="provider-fields">
        <label>
          <span>Prompt dialect</span>
          <strong>Structured tool loop</strong>
        </label>
        <label>
          <span>Edit strategy</span>
          <strong>Patch with verification</strong>
        </label>
        <label>
          <span>Continuation</span>
          <strong>Resume from run state</strong>
        </label>
      </div>
      <div className="provider-meter">
        <span>
          <i style={{ width: '82%' }} />
        </span>
        <small>Context window protected</small>
      </div>
    </div>
  )
}

export function RunMap(): React.ReactNode {
  const nodes = [
    ['Explorer', 'Repository mapped'],
    ['Architect', 'Contract declared'],
    ['Developer', 'Change landed'],
    ['Verifier', 'Evidence ready'],
  ] as const

  return (
    <div className="run-map" aria-hidden="true">
      <span className="run-map-root">
        <Logo size={28} />
      </span>
      {nodes.map(([name, state], index) => (
        <span className={`run-map-node run-map-node--${index + 1}`} key={name}>
          <i>
            <Glyph name={index === 0 ? 'folder' : index === 1 ? 'plan' : index === 2 ? 'build' : 'verify'} />
          </i>
          <b>{name}</b>
          <small>{state}</small>
        </span>
      ))}
      <i className="run-map-line run-map-line--1" />
      <i className="run-map-line run-map-line--2" />
      <i className="run-map-line run-map-line--3" />
      <i className="run-map-line run-map-line--4" />
    </div>
  )
}

export function EvidencePanel({ mode = 'browser' }: { mode?: 'browser' | 'trace' }): React.ReactNode {
  if (mode === 'trace') {
    return (
      <div className="evidence-panel evidence-panel--trace" aria-hidden="true">
        <div className="evidence-top">
          <span>COMPLETION POLICY</span>
          <strong>4 / 4</strong>
        </div>
        {['Typecheck', 'Unit tests', 'Production build', 'Browser assertions'].map((item) => (
          <div className="evidence-check" key={item}>
            <span>✓</span>
            <b>{item}</b>
            <small>passed</small>
          </div>
        ))}
        <div className="evidence-ready">
          <Glyph name="verify" />
          <span>
            <small>DECISION</small>
            <strong>Evidence supports completion</strong>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="browser-panel" aria-hidden="true">
      <div className="browser-chrome">
        <i />
        <i />
        <i />
        <span>localhost:3000/settings</span>
      </div>
      <div className="browser-page">
        <aside />
        <main>
          <span />
          <span />
          <span />
          <div>
            <b />
            <b />
          </div>
        </main>
      </div>
      <div className="browser-receipt">
        <span>
          <i /> Rendered page
        </span>
        <strong>6 assertions passed</strong>
      </div>
    </div>
  )
}

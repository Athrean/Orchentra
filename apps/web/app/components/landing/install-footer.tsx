import { m } from 'framer-motion'
import { GITHUB_URL, INSTALL_COMMAND, ISSUES_URL, LICENSE_URL, README_URL, RELEASES_URL, SECURITY_URL } from './data'
import { Reveal, softSpring, stagger } from './motion'
import { CopyCommand, Logo } from './ui'

export function InstallCTA(): React.ReactNode {
  return (
    <section className="install-cta ruled-section" id="install" aria-labelledby="install-title">
      <div className="section-frame">
        <Reveal className="centered-intro">
          <p className="eyebrow">Run it where the code lives</p>
          <h2 id="install-title">Bring your keys. Keep the control plane local.</h2>
          <p>
            Orchentra runs against your checkout with no application database, no hosted workspace, and no product
            telemetry.
          </p>
        </Reveal>

        <div className="install-grid">
          <Reveal className="install-terminal">
            <div className="install-terminal-bar">
              <span>~</span>
              <span>Install</span>
            </div>
            <CopyCommand command={INSTALL_COMMAND} />
            <div className="install-output" aria-hidden="true">
              <span>package</span>
              <strong>@athreanlab/orchentra</strong>
              <span>scope</span>
              <strong>global</strong>
              <span>status</span>
              <strong>ready</strong>
            </div>
          </Reveal>
          <Reveal className="install-copy" delay={0.06}>
            <span className="install-index">01 / INSTALL</span>
            <h3>Open a repository. Start the run.</h3>
            <p>Choose a model, describe the outcome, and let the harness connect the plan, execution, and evidence.</p>
            <a className="button button--dark" href={README_URL}>
              Read the setup guide ↗
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export function Footer(): React.ReactNode {
  return (
    <footer className="brand-footer" id="footer">
      <div className="section-frame footer-grid">
        <Reveal className="footer-brand-block">
          <div className="footer-brand">
            <Logo size={27} />
            <span>Orchentra</span>
          </div>
          <p>A local-first coding harness that makes specialist agents accountable to the repository and its checks.</p>
        </Reveal>

        <m.div
          className="footer-links"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.18 }}
          variants={stagger}
        >
          <FooterColumn
            title="Product"
            links={[
              ['Run trace', '#run'],
              ['Crew', '#crew'],
              ['Workflow', '#workflow'],
              ['Install', '#install'],
            ]}
          />
          <FooterColumn
            title="Project"
            links={[
              ['GitHub', GITHUB_URL],
              ['README', README_URL],
              ['Releases', RELEASES_URL],
              ['Issues', ISSUES_URL],
            ]}
          />
          <FooterColumn
            title="Principles"
            links={[
              ['Local-first', '#run'],
              ['Evidence-gated', '#why'],
              ['Budget-aware', '#why'],
              ['Provider choice', '#workflow'],
            ]}
          />
          <FooterColumn
            title="Trust"
            links={[
              ['Security', SECURITY_URL],
              ['Apache-2.0 license', LICENSE_URL],
            ]}
          />
        </m.div>
      </div>

      <div className="section-frame footer-bottom">
        <span>Orchentra by Athrean Lab</span>
        <span>CLI-first · BYOK · zero DB · no telemetry</span>
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: ReadonlyArray<readonly [string, string]>
}): React.ReactNode {
  return (
    <m.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: softSpring } }}>
      <h3>{title}</h3>
      <ul>
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href}>{label}</a>
          </li>
        ))}
      </ul>
    </m.div>
  )
}

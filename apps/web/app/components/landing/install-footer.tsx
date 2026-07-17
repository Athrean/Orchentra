import { m } from 'framer-motion'
import { GITHUB_URL, INSTALL_COMMAND, ISSUES_URL, LICENSE_URL, README_URL, RELEASES_URL, SECURITY_URL } from './data'
import { Reveal, softSpring, stagger } from './motion'
import { CopyCommand, Logo } from './ui'

export function InstallCTA(): React.ReactNode {
  return (
    <section className="install-cta section-pad" id="install" aria-labelledby="install-title">
      <div className="section-frame install-grid">
        <Reveal className="install-panel">
          <p className="eyebrow">Start in the terminal</p>
          <h2 id="install-title">Put proof inside the coding loop.</h2>
          <p>
            One global install. Your provider keys. Your repository. No hosted control plane between the work and you.
          </p>
          <div className="install-art" aria-hidden="true">
            <span>READ</span>
            <span>BUILD</span>
            <span>RUN</span>
            <strong>PROVE</strong>
          </div>
        </Reveal>
        <Reveal className="install-action" delay={0.08}>
          <span className="install-index">01 / INSTALL</span>
          <h3>Install Orchentra globally.</h3>
          <CopyCommand command={INSTALL_COMMAND} />
          <p>Then run Orchentra from the repository you want the crew to understand.</p>
          <a className="button button--dark" href={GITHUB_URL}>
            Read the setup guide ↗
          </a>
        </Reveal>
      </div>
    </section>
  )
}

export function Footer(): React.ReactNode {
  return (
    <footer className="brand-footer" id="footer">
      <div className="section-frame footer-grid">
        <Reveal className="footer-statement">
          <div className="footer-brand">
            <Logo size={34} />
            <span>Orchentra</span>
          </div>
          <h2>Built where your code lives.</h2>
          <p>Orchentra, the model-aware coding harness from Athrean Lab.</p>
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
              ['Why Orchentra', '#why'],
              ['Crew', '#crew'],
              ['Capabilities', '#capabilities'],
              ['Install', '#install'],
            ]}
          />
          <FooterColumn
            title="Workflow"
            links={[
              ['Inspect', '#workflow'],
              ['Decide', '#workflow'],
              ['Execute', '#workflow'],
              ['Prove', '#workflow'],
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
            title="Trust"
            links={[
              ['Security', SECURITY_URL],
              ['Apache-2.0 license', LICENSE_URL],
              ['Questions', '#faq'],
            ]}
          />
        </m.div>
      </div>

      <m.div
        className="footer-wordmark"
        aria-hidden="true"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ ...softSpring, delay: 0.08 }}
      >
        ORCHENTRA
      </m.div>

      <div className="section-frame footer-bottom">
        <span>© {new Date().getFullYear()} Orchentra by Athrean Lab</span>
        <span>CLI-first · BYOK · zero DB · no telemetry</span>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: ReadonlyArray<readonly [string, string]> }) {
  return (
    <m.div variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: softSpring } }}>
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

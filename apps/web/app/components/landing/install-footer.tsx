import { GITHUB_URL, INSTALL_COMMAND, ISSUES_URL, LICENSE_URL, README_URL, RELEASES_URL, SECURITY_URL } from './data'
import { Reveal } from './motion'
import { Brand, CopyCommand, CornerButton } from './ui'

export function FinalCTA(): React.ReactNode {
  return (
    <section className="final-cta ruled-section" id="install" aria-labelledby="install-title">
      <div className="site-rail final-cta-inner">
        <div className="technical-texture" aria-hidden="true">
          <span className="texture-orbit texture-orbit--one" />
          <span className="texture-orbit texture-orbit--two" />
          <span className="texture-cross texture-cross--one">+</span>
          <span className="texture-cross texture-cross--two">+</span>
        </div>
        <Reveal className="final-cta-copy">
          <p className="eyebrow eyebrow--light">READY WHEN YOUR REPOSITORY IS</p>
          <h2 id="install-title">
            Give the next coding run
            <br />a real finish line.
          </h2>
          <p>Install the open-source harness. Bring your provider keys. Keep the evidence local.</p>
          <div className="final-actions">
            <CornerButton href={GITHUB_URL} external>
              VIEW ON GITHUB
            </CornerButton>
            <a href="/contact" className="text-link text-link--dark">
              CONTACT ATHREAN LAB <span>↗</span>
            </a>
          </div>
        </Reveal>
        <Reveal className="final-command" delay={0.08}>
          <CopyCommand command={INSTALL_COMMAND} />
        </Reveal>
      </div>
    </section>
  )
}

export function Footer(): React.ReactNode {
  return (
    <footer className="site-footer">
      <div className="site-rail footer-top">
        <div className="footer-about">
          <a href="#top" aria-label="Back to top">
            <Brand />
          </a>
          <p>The coding harness for model-aware execution, constrained delegation, and evidence-gated completion.</p>
        </div>
        <FooterColumn
          title="PRODUCT"
          links={[
            ['Capabilities', '/#capabilities'],
            ['Workflow', '/#workflow'],
            ['Pricing', '/#pricing'],
            ['Install', '/#install'],
          ]}
        />
        <FooterColumn
          title="PROJECT"
          links={[
            ['GitHub', GITHUB_URL],
            ['Documentation', README_URL],
            ['Releases', RELEASES_URL],
            ['Issues', ISSUES_URL],
          ]}
        />
        <FooterColumn
          title="COMPANY"
          links={[
            ['Athrean Lab', '/contact'],
            ['Contact', '/contact'],
            ['Security', SECURITY_URL],
            ['License', LICENSE_URL],
          ]}
        />
      </div>
      <div className="site-rail footer-bottom">
        <span>ORCHENTRA BY ATHREAN LAB</span>
        <span>CLI-FIRST · BYOK · ZERO DB · NO TELEMETRY</span>
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
    <div className="footer-column">
      <h3>{title}</h3>
      <ul>
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href}>
              {label}
              <span>↗</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

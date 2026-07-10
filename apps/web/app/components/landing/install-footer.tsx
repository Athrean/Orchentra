import { m } from 'framer-motion'
import { GITHUB_URL, INSTALL_COMMAND, ISSUES_URL, README_URL, RELEASES_URL, SECURITY_URL } from './data'
import { Reveal, softSpring, stagger } from './motion'
import { FooterPixelField } from './pixel-field'
import { CopyCommand, Logo } from './ui'

export function InstallCTA(): React.ReactNode {
  return (
    <section className="install-cta" id="install" aria-labelledby="install-title">
      <Reveal className="narrow-wrap">
        <p className="cta-kicker">CLI-first · BYOK · local sessions</p>
        <h2 id="install-title" className="pixel-type">
          Put the crew in your terminal.
        </h2>
        <m.a
          className="pixel-button pixel-button--large"
          href={GITHUB_URL}
          whileHover={{ y: -4, scale: 1.015 }}
          whileTap={{ scale: 0.98 }}
        >
          Install Orchentra <span aria-hidden="true">↗</span>
        </m.a>
        <p className="cta-copy">
          No hosted workspace. No application database. Orchentra works against the checkout you already trust and hands
          the result back through git.
        </p>
        <CopyCommand command={INSTALL_COMMAND} />
      </Reveal>
    </section>
  )
}

export function Footer(): React.ReactNode {
  return (
    <footer className="brand-footer" id="footer">
      <FooterPixelField />

      <div className="content-wrap footer-top">
        <Reveal className="footer-statement">
          <div className="footer-brand">
            <Logo size={42} light />
            <span>Orchentra</span>
          </div>
          <h2 className="pixel-type">One crew. Every repo.</h2>
          <p>Plan with intent. Build the minimum. Let the checks speak.</p>
        </Reveal>

        <m.div
          className="footer-links"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          <FooterColumn
            title="Product"
            links={[
              ['Crew', '#crew'],
              ['Agent spine', '#spine'],
              ['Workflow', '#workflow'],
              ['Install', '#install'],
            ]}
          />
          <FooterColumn
            title="Agents"
            links={[
              ['/plan', '#crew'],
              ['/build', '#crew'],
              ['/review', '#crew'],
              ['Subagents', '#agents'],
            ]}
          />
          <FooterColumn
            title="Project"
            links={[
              ['GitHub', GITHUB_URL],
              ['README', README_URL],
              ['Releases', RELEASES_URL],
              ['Issues', ISSUES_URL],
              ['Security', SECURITY_URL],
            ]}
          />
        </m.div>
      </div>

      <m.div
        className="footer-wordmark pixel-type"
        aria-hidden="true"
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ ...softSpring, delay: 0.1 }}
      >
        ORCHENTRA
      </m.div>

      <div className="content-wrap footer-bottom">
        <span>© {new Date().getFullYear()} Orchentra</span>
        <span>CLI-only · zero DB · your provider keys</span>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: ReadonlyArray<readonly [string, string]> }) {
  return (
    <m.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: softSpring } }}>
      <h3>{title}</h3>
      <ul>
        {links.map(([label, href]) => (
          <li key={label}>
            <m.a href={href} whileHover={{ x: 3 }}>
              {label}
            </m.a>
          </li>
        ))}
      </ul>
    </m.div>
  )
}

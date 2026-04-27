import { Container } from './Container'
import { Logo } from './Logo'

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Integrations', href: '#integrations' },
      { label: 'Changelog', href: 'https://github.com/Athrean/Orchentra/releases' },
    ],
  },
  {
    heading: 'Open source',
    links: [
      { label: 'GitHub', href: 'https://github.com/Athrean/Orchentra' },
      { label: 'Issues', href: 'https://github.com/Athrean/Orchentra/issues' },
      { label: 'Pull requests', href: 'https://github.com/Athrean/Orchentra/pulls' },
      { label: 'License', href: 'https://github.com/Athrean/Orchentra/blob/main/LICENSE' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Docs', href: 'https://github.com/Athrean/Orchentra#readme' },
      { label: 'Self-hosting', href: 'https://github.com/Athrean/Orchentra#self-hosting' },
      { label: 'Architecture', href: 'https://github.com/Athrean/Orchentra#architecture' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Contact', href: 'mailto:hello@orchentra.dev' },
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
    ],
  },
]

export function Footer(): React.ReactNode {
  return (
    <footer className="mk-surface-dark">
      <Container className="py-16">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <Logo size={28} color="var(--color-on-dark)" />
            <p className="mt-4 max-w-[280px] text-[14px] leading-[1.6] mk-text-on-dark-soft">
              Open-source AI incident triage for engineering teams.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 md:col-span-8 md:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <h4 className="mk-caption-upper mk-text-on-dark mb-4">{col.heading}</h4>
                <ul className="space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a href={l.href} className="text-[14px] mk-text-on-dark-soft hover:mk-text-on-dark">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-white/8 pt-8">
          <p className="text-[13px] mk-text-on-dark-soft">
            © {new Date().getFullYear()} Orchentra. Released under the MIT License.
          </p>
          <p className="mk-mono text-[12px] mk-text-on-dark-soft">v0.1.0-alpha</p>
        </div>
      </Container>
    </footer>
  )
}

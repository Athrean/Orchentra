import Link from 'next/link'
import { Container } from './Container'
import { SpikeMark } from './SpikeMark'

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Integrations', href: '#integrations' },
  { label: 'Open source', href: 'https://github.com/Athrean/Orchentra' },
]

export function TopNav({ loginHref }: { loginHref: string }): React.ReactNode {
  return (
    <header className="mk-canvas sticky top-0 z-30 h-16 border-b mk-border-hairline-soft">
      <Container className="flex h-full items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-2 mk-text-ink">
            <SpikeMark size={20} />
            <span className="text-[20px] tracking-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
              Orchentra
            </span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="nav-link text-[14px] font-medium mk-text-body hover:mk-text-ink">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <a href={loginHref} className="hidden text-[14px] font-medium mk-text-ink hover:mk-text-coral md:inline">
            Sign in
          </a>
          <a
            href={loginHref}
            className="mk-coral inline-flex h-10 items-center rounded-lg px-5 text-[14px] font-medium hover:opacity-90"
          >
            Try Orchentra
          </a>
        </div>
      </Container>
    </header>
  )
}

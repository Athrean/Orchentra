// apps/web/components/marketing-v2/Footer.tsx
import Link from 'next/link'

const SECTIONS = [
  {
    label: 'product',
    links: [
      { href: '/docs', label: 'docs' },
      { href: 'https://github.com/Athrean/Orchentra', label: 'github' },
      { href: '/docs/mcp', label: 'mcp' },
    ],
  },
  {
    label: 'resources',
    links: [
      { href: '/changelog', label: 'changelog' },
      { href: '/blog', label: 'blog' },
    ],
  },
  {
    label: 'legal',
    links: [
      { href: '/legal/privacy', label: 'privacy' },
      { href: '/legal/terms', label: 'terms' },
    ],
  },
]

export function Footer({ loginHref, version }: { loginHref: string; version: string }) {
  return (
    <footer className="border-t border-[var(--color-pg-hairline)]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-12 md:grid-cols-3">
        {SECTIONS.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] uppercase tracking-wider text-[var(--color-pg-text-mute)]">{s.label}</p>
            <ul className="mt-3 space-y-2">
              {s.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-[var(--color-pg-text-0)] hover:text-[var(--color-pg-accent-green)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--color-pg-hairline)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 text-[11px] text-[var(--color-pg-text-mute)]">
          <span>orchentra · v{version}</span>
          <Link href={loginHref} className="hover:text-[var(--color-pg-text-0)]">
            sign in →
          </Link>
        </div>
      </div>
    </footer>
  )
}

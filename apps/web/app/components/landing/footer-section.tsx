import Image from 'next/image'
import Link from 'next/link'
import { GithubIcon } from '../icons'
import { LayersIcon, BookIcon } from '../animate-icons'
import { integrations, resources, footerCols } from '../../data/landing'
import { GITHUB_REPO_URL } from '../../lib/constants'

export function ResourcesSection(): React.ReactNode {
  return (
    <section id="resources" className="bg-surface-1 py-24 md:py-32">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid gap-16 lg:grid-cols-2">
          <div>
            <div className="mb-6 text-text-primary">
              <LayersIcon size={28} />
            </div>
            <h2 className="font-serif text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.15] text-text-primary">
              Connect your
              <br />
              existing stack
            </h2>
            <p className="mt-4 max-w-sm text-[14px] leading-[1.7] text-text-secondary">
              Every integration is one TypeScript file. Add your own in minutes.
            </p>
            <div className="mt-8 space-y-3">
              {integrations.map((int) => (
                <div
                  key={int.name}
                  className="shadow-elevated flex items-center justify-between rounded-[24px] border border-border bg-surface-2 px-5 py-3.5 transition-all"
                >
                  <span className="text-[14px] font-medium text-text-primary">{int.name}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      int.live ? 'bg-accent/10 text-accent' : 'bg-surface-2 text-text-muted'
                    }`}
                  >
                    {int.live ? 'Live' : 'Planned'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-6 text-text-primary">
              <BookIcon size={28} />
            </div>
            <h2 className="font-serif text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.15] text-text-primary">
              Explore the
              <br />
              latest resources
            </h2>
            <div className="mt-8 space-y-1">
              {resources.map((r) => (
                <Link
                  key={r.title}
                  href={r.href}
                  target={r.href.startsWith('http') ? '_blank' : undefined}
                  rel={r.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="group flex items-center justify-between rounded-[24px] px-5 py-4 transition-all hover:bg-surface-2"
                >
                  <div>
                    <span className="text-[14px] font-medium text-text-primary group-hover:text-accent transition-colors">
                      {r.title}
                    </span>
                    <p className="mt-0.5 text-[13px] text-text-muted">{r.desc}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-text-muted">
                    {r.tag}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function Footer(): React.ReactNode {
  return (
    <footer className="hero-bg hero-border border-t">
      <div className="mx-auto max-w-[1440px] px-6 py-16 md:py-20">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="flex items-center">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                <Image
                  src="/green-logo.png"
                  alt="Orchentra"
                  width={76}
                  height={76}
                  className="absolute h-[76px] w-auto max-w-none object-contain"
                />
              </div>
              <span className="hero-text -ml-1 font-serif text-[34px] tracking-tight md:text-[38px]">Orchentra</span>
            </div>
            <p className="hero-text-secondary mt-4 max-w-xs text-[13px] leading-relaxed">
              Open source AI agent for CI/CD incident triage. Self-hosted. MIT licensed. Built for engineering teams.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {['Triage', 'Investigate', 'Resolve'].map((tag) => (
                <span
                  key={tag}
                  className="hero-border hero-text-muted rounded-full border px-3 py-1 text-[11px] font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {footerCols.map((col) => (
            <div key={col.heading}>
              <span className="hero-text text-[11px] font-bold uppercase tracking-[0.15em]">{col.heading}</span>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((lk) => (
                  <li key={lk.l}>
                    <Link
                      href={lk.h}
                      target={lk.h.startsWith('http') ? '_blank' : undefined}
                      rel={lk.h.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="hero-text-secondary text-[13px] transition-colors hover:text-(--color-hero-text)"
                    >
                      {lk.l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="hero-border mt-16 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row">
          <span className="hero-text-muted text-[12px]">
            &copy; {new Date().getFullYear()} Orchentra. Open source under MIT.
          </span>
          <div className="flex items-center gap-4">
            <Link
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hero-text-muted transition-colors hover:text-(--color-hero-text)"
            >
              <GithubIcon className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

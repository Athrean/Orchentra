import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  GithubIcon,
  ArrowRight,
  StarIcon,
  OrchentraLogo,
  ShieldIcon,
  SparklesIcon,
  PlayIcon,
  TerminalIcon,
  LayersIcon,
  BookIcon,
} from './components/icons'
import { SectionHeading } from './components/landing-ui'
import { capabilities, valueProps, useCases, integrations, resources, footerCols } from './data/landing'

const LOGIN_URL_FALLBACK = 'http://localhost:3001'

function getLoginUrl(): string {
  return `${process.env.NEXT_PUBLIC_API_URL || LOGIN_URL_FALLBACK}/auth/github`
}

export default async function Page(): Promise<React.ReactNode> {
  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')

  if (session?.value) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || LOGIN_URL_FALLBACK
    let shouldRedirect = false
    try {
      const res = await fetch(`${apiBase}/api/me`, {
        headers: { Cookie: `orchentra_session=${session.value}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = (await res.json()) as { org?: { id?: string } }
        if (data.org?.id) shouldRedirect = true
      }
    } catch {
      // Network error — fall through to landing page
    }
    if (shouldRedirect) redirect('/onboarding')
  }

  return (
    <div className="min-h-screen bg-cream">
      <Nav />
      <main>
        <HeroSection />
        <ValuePropSection />
        <CapabilitiesSection />
        <ProductDemoSection />
        <UseCasesSection />
        <CTABanner />
        <ResourcesSection />
      </main>
      <Footer />
    </div>
  )
}

/* ─────────────────────────────────────────────
   Navigation
   ───────────────────────────────────────────── */
function Nav(): React.ReactNode {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-cream/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/green-logo.png" alt="" className="h-7 w-7" />
          <span className="font-serif text-[20px] text-text-primary">Orchentra</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <Link
            href="#features"
            className="text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Features
          </Link>
          <Link
            href="#use-cases"
            className="text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Use Cases
          </Link>
          <Link
            href="/docs"
            className="text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Docs
          </Link>
          <Link
            href="https://github.com/Athrean/Orchentra"
            target="_blank"
            className="text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            GitHub
          </Link>
          <Link
            href="https://github.com/Athrean/Orchentra"
            target="_blank"
            className="flex items-center gap-1.5 text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <StarIcon className="h-3.5 w-3.5" />
            Star
          </Link>
        </div>

        <a
          href={getLoginUrl()}
          className="rounded-full bg-accent px-5 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Get Started
        </a>
      </nav>
    </header>
  )
}

/* ─────────────────────────────────────────────
   Hero — "Meet your incident triage partner"
   ───────────────────────────────────────────── */
function HeroSection(): React.ReactNode {
  return (
    <section className="relative overflow-hidden pt-32 pb-24 md:pt-40 md:pb-32">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left — text */}
          <div>
            <span className="fade-up inline-block font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-text-secondary">
              Product
            </span>
            <h1 className="fade-up mt-4 font-serif text-[clamp(2.5rem,5.5vw,4.5rem)] leading-[1.08] tracking-tight text-text-primary">
              Meet your
              <br />
              incident triage
              <br />
              partner
            </h1>
            <p className="fade-up-d1 mt-6 max-w-[440px] text-[16px] leading-[1.7] text-text-secondary">
              Tackle any CI failure with AI-powered root cause analysis. Orchentra reads your logs, finds the root
              cause, and delivers a brief — before your team even notices.
            </p>

            {/* CTA */}
            <div className="fade-up-d2 mt-8 flex items-center gap-4">
              <a
                href={getLoginUrl()}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[14px] font-semibold text-white shadow-[0_2px_12px_rgba(91,117,83,0.25)] transition-all hover:bg-accent-hover"
              >
                <GithubIcon className="h-4 w-4" />
                Login with GitHub
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/docs"
                className="text-[14px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
              >
                Read the docs &rarr;
              </Link>
            </div>

            {/* Tags */}
            <div className="fade-up-d3 mt-8 flex flex-wrap gap-2">
              {['Triage', 'Investigate', 'Resolve'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-white px-4 py-1.5 text-[12px] font-medium text-text-secondary"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Right — illustration */}
          <div className="relative hidden lg:block">
            <div className="relative mx-auto w-full max-w-[480px]">
              {/* Decorative dots */}
              <div className="absolute -top-6 right-12 h-4 w-4 rounded-full bg-accent/60" />
              <div className="absolute top-16 -right-4 h-3 w-3 rounded-full bg-accent/40" />
              <div className="absolute -bottom-2 left-20 h-2.5 w-2.5 rounded-full bg-accent/30" />

              {/* Large logo mark */}
              <OrchentraLogo className="h-full w-full stroke-text-primary stroke-[0.8] opacity-90" />

              {/* Decorative lines */}
              <div className="absolute top-1/2 -left-8 h-px w-16 bg-border" />
              <div className="absolute bottom-1/4 -right-8 h-px w-16 bg-border" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   Value Prop — "The AI for incident response"
   ───────────────────────────────────────────── */
function ValuePropSection(): React.ReactNode {
  return (
    <section className="py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="text-center">
          <h2 className="font-serif text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.15] tracking-tight text-text-primary">
            The AI for incident response
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-text-secondary">
            Self-hosted. Open source. Set up in one command.
          </p>

          {/* Setup pills */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[13px] text-text-muted">
            <span>Get started:</span>
            <code className="rounded-md border border-border bg-white px-3 py-1 font-mono text-[12px] text-text-primary">
              git clone
            </code>
            <code className="rounded-md border border-border bg-white px-3 py-1 font-mono text-[12px] text-text-primary">
              configure
            </code>
            <code className="rounded-md border border-border bg-white px-3 py-1 font-mono text-[12px] text-text-primary">
              docker compose up
            </code>
          </div>
        </div>

        {/* Integration map */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              'GitHub Actions',
              'Sentry',
              'Slack',
              'CI Logs',
              'Orchentra Agent',
              'Root Cause',
              'Slack Brief',
              'Postmortem',
              'Datadog',
              'PagerDuty',
            ].map((node, i) => (
              <span
                key={node}
                className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-all ${
                  i === 4
                    ? 'border-accent bg-accent text-white shadow-[0_2px_12px_rgba(91,117,83,0.25)]'
                    : i < 4
                      ? 'border-accent/30 bg-accent/5 text-accent'
                      : i < 8
                        ? 'border-border bg-white text-text-primary'
                        : 'border-border bg-white text-text-muted'
                }`}
              >
                {node}
                {i >= 8 && <span className="ml-1 text-[11px] opacity-50">soon</span>}
              </span>
            ))}
          </div>

          {/* Connecting line decoration */}
          <div className="mx-auto mt-2 h-8 w-px bg-gradient-to-b from-border to-transparent" />
        </div>

        {/* Three value props */}
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {valueProps.map((v, i) => (
            <div key={i} className="group">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white text-text-secondary">
                {i === 0 && <LayersIcon className="h-4 w-4" />}
                {i === 1 && <ShieldIcon className="h-4 w-4" />}
                {i === 2 && <SparklesIcon className="h-4 w-4" />}
              </div>
              <h3 className="font-serif text-[20px] text-text-primary">{v.title}</h3>
              <p className="mt-2 text-[14px] leading-[1.7] text-text-secondary">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   Capabilities — "Orchentra capabilities"
   ───────────────────────────────────────────── */
function CapabilitiesSection(): React.ReactNode {
  return (
    <section id="features" className="py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6">
        <SectionHeading icon={<ShieldIcon className="h-7 w-7" />} title="Orchentra capabilities" />

        <div className="mx-auto mt-14 max-w-3xl space-y-4">
          {capabilities.map((cap) => (
            <div
              key={cap.name}
              className="group rounded-2xl border border-border bg-white p-8 transition-all duration-300 hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-serif text-[24px] text-text-primary">{cap.name}</h3>
                  <p className="mt-2 max-w-md text-[14px] leading-[1.7] text-text-secondary">{cap.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cap.tags.map((tag) => (
                    <span
                      key={tag}
                      className="whitespace-nowrap rounded-full bg-surface-2 px-3 py-1 text-[12px] font-medium text-text-secondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-5">
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-4 py-2 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/15"
                >
                  Learn more
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   Product Demo — "See Orchentra in action"
   ───────────────────────────────────────────── */
function ProductDemoSection(): React.ReactNode {
  return (
    <section id="demo" className="py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6">
        <SectionHeading
          icon={<PlayIcon className="h-7 w-7" />}
          title={
            <>
              See Orchentra
              <br className="hidden sm:block" />
              in action
            </>
          }
        />

        <p className="mx-auto mt-4 max-w-md text-center text-[15px] text-text-secondary">
          From CI failure to root cause brief — in 30 seconds.
        </p>

        {/* Product screenshot */}
        <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border border-border bg-white shadow-[0_8px_40px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-1.5 border-b border-border px-5 py-3.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-3 font-mono text-[11px] text-text-muted">orchentra — dashboard</span>
          </div>
          <div className="relative bg-surface-2">
            <SlackMockup />
          </div>
        </div>

        {/* Terminal quickstart */}
        <div className="mx-auto mt-12 max-w-2xl">
          <div className="overflow-hidden rounded-2xl border border-border bg-[#1a1a1a] shadow-[0_4px_24px_rgba(0,0,0,0.12)]">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 font-mono text-[11px] text-white/40">terminal</span>
            </div>
            <pre className="overflow-x-auto px-6 py-5 font-mono text-[13px] leading-8 text-white/70">
              <span className="text-white/40">$</span> <span className="text-white">git clone</span>{' '}
              <span className="text-green-400">https://github.com/Athrean/Orchentra</span>
              {'\n'}
              <span className="text-white/40">$</span> <span className="text-white">cd</span> Orchentra {'&&'}{' '}
              <span className="text-white">cp</span> orchentra.yml.example orchentra.yml
              {'\n'}
              <span className="text-white/40">$</span> <span className="text-white">docker compose up</span>
              <span className="blink text-green-400 ml-1">▋</span>
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}

function SlackMockup(): React.ReactNode {
  return (
    <div className="flex items-center justify-center p-8 md:p-12">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-white shadow-xl">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
          <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
          <span className="h-2 w-2 rounded-full bg-[#28c840]" />
          <span className="ml-2 font-mono text-[10px] text-text-muted"># incidents</span>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 font-serif text-xs font-bold text-accent">
              O
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-semibold text-text-primary">Orchentra</span>
                <span className="font-mono text-[9px] text-text-muted">2:34 PM</span>
              </div>
              <div className="mt-1.5 rounded-lg border border-border bg-surface-0 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                  CI &middot; deploy-api &middot; my-org/api
                </p>
                <p className="mt-2 text-[11px] leading-snug text-text-secondary">
                  Missing{' '}
                  <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[10px] text-accent">
                    DATABASE_URL
                  </code>{' '}
                  env var. Confidence: <span className="font-mono text-accent">92%</span>
                </p>
                <div className="mt-2 flex gap-1.5">
                  <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                    Re-run with fix
                  </span>
                  <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-muted">
                    Dig deeper
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Use Cases — "How you can use Orchentra"
   ───────────────────────────────────────────── */
function UseCasesSection(): React.ReactNode {
  return (
    <section id="use-cases" className="py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6">
        <SectionHeading
          icon={<TerminalIcon className="h-7 w-7" />}
          title={
            <>
              How you can use
              <br className="hidden sm:block" />
              Orchentra
            </>
          }
        />

        {/* Use case tabs */}
        <div className="mx-auto mt-8 flex flex-wrap justify-center gap-2">
          {useCases.map((uc, i) => (
            <span
              key={uc.category}
              className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition-all ${
                i === 0
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-white text-text-secondary hover:border-border-hover'
              }`}
            >
              {uc.category}
            </span>
          ))}
        </div>

        <div className="mt-14 space-y-8">
          {useCases.map((uc, i) => (
            <div key={uc.category} className="overflow-hidden rounded-2xl border border-border bg-white">
              <div className="grid md:grid-cols-2">
                {/* Left — description */}
                <div className={`p-8 md:p-10 ${i % 2 === 1 ? 'md:order-2' : ''}`}>
                  <span className="inline-block rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent">
                    {uc.category}
                  </span>
                  <h3 className="mt-4 font-serif text-[24px] leading-[1.2] text-text-primary">{uc.title}</h3>
                  <p className="mt-3 text-[14px] leading-[1.7] text-text-secondary">{uc.description}</p>
                </div>

                {/* Right — mock detail card */}
                <div
                  className={`border-t border-border bg-surface-2/50 p-8 md:border-t-0 md:p-10 ${i % 2 === 1 ? 'md:order-1 md:border-r' : 'md:border-l'}`}
                >
                  <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                      {uc.detail.heading}
                    </p>
                    <p className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-red-500">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                      {uc.detail.status}
                    </p>
                    <p className="mt-3 text-[13px] leading-relaxed text-text-secondary">{uc.detail.finding}</p>
                    <p className="mt-2 text-[12px] text-text-muted">
                      Confidence: <span className="font-mono font-semibold text-accent">{uc.detail.confidence}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {uc.detail.actions.map((a) => (
                        <span key={a} className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   CTA Banner — "What CI failure are you up against?"
   ───────────────────────────────────────────── */
function CTABanner(): React.ReactNode {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-col items-center justify-between gap-6 rounded-2xl border border-border bg-white px-8 py-8 sm:flex-row sm:px-12">
          <h2 className="font-serif text-[clamp(1.25rem,3vw,1.75rem)] text-text-primary">
            What CI failure are you up against?
          </h2>
          <a
            href={getLoginUrl()}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-6 py-3 text-[14px] font-semibold text-white shadow-[0_2px_12px_rgba(91,117,83,0.25)] transition-all hover:bg-accent-hover"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   Resources — "Explore integrations & resources"
   ───────────────────────────────────────────── */
function ResourcesSection(): React.ReactNode {
  return (
    <section id="resources" className="py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="grid gap-16 lg:grid-cols-2">
          {/* Left — integrations */}
          <div>
            <div className="mb-6 text-text-primary">
              <LayersIcon className="h-7 w-7" />
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
                  className="flex items-center justify-between rounded-xl border border-border bg-white px-5 py-3.5 transition-all hover:shadow-sm"
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

          {/* Right — resources */}
          <div>
            <div className="mb-6 text-text-primary">
              <BookIcon className="h-7 w-7" />
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
                  className="group flex items-center justify-between rounded-xl px-5 py-4 transition-all hover:bg-white"
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

/* ─────────────────────────────────────────────
   Footer
   ───────────────────────────────────────────── */
function Footer(): React.ReactNode {
  return (
    <footer className="border-t border-border bg-[#0C0C0C]">
      <div className="mx-auto max-w-[1200px] px-6 py-16 md:py-20">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-6">
          {/* Brand column */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/white-logo.png" alt="" className="h-7 w-7" />
              <span className="font-serif text-[18px] text-white">Orchentra</span>
            </div>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-white/50">
              Open source AI agent for CI/CD incident triage. Self-hosted. MIT licensed. Built for engineering teams.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {['Triage', 'Investigate', 'Resolve'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium text-white/40"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {footerCols.map((col) => (
            <div key={col.heading}>
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/80">{col.heading}</span>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((lk) => (
                  <li key={lk.l}>
                    <Link
                      href={lk.h}
                      target={lk.h.startsWith('http') ? '_blank' : undefined}
                      className="text-[13px] text-white/50 transition-colors hover:text-white"
                    >
                      {lk.l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <span className="text-[12px] text-white/30">
            &copy; {new Date().getFullYear()} Orchentra. Open source under MIT.
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="https://github.com/Athrean/Orchentra"
              target="_blank"
              className="text-white/30 transition-colors hover:text-white"
            >
              <GithubIcon className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

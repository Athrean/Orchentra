import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { GithubIcon, ArrowRight, StarIcon, OrchentraLogo } from './components/icons'
import { SectionHeading, Divider } from './components/landing-ui'
import {
  steps,
  features,
  integrations,
  identityItems,
  problems,
  reactSteps,
  auditTraceTools,
  openSourceCards,
  footerCols,
} from './data/landing'

export default async function Page(): Promise<React.ReactNode> {
  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')

  if (session?.value) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
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
    <div className="min-h-screen">
      {/* ── Nav ── */}
      <header className="absolute inset-x-0 top-0 z-50">
        <div className="mx-auto flex max-w-[720px] justify-center px-4">
          <nav className="mt-4 flex h-11 items-center gap-6 rounded-full border border-white/20 bg-white/10 px-6 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.1)] backdrop-blur-3xl">
            <Link
              href="/docs"
              className="hidden text-[13px] font-medium text-white/80 transition-colors hover:text-white sm:block"
            >
              Docs
            </Link>
            <Link
              href="https://github.com/Athrean/Orchentra"
              target="_blank"
              className="hidden items-center gap-1.5 text-[13px] font-medium text-white/80 transition-colors hover:text-white sm:flex"
            >
              <GithubIcon className="h-3.5 w-3.5 fill-current" />
              GitHub
            </Link>

            <Link href="/" className="font-display text-[15px] font-bold tracking-tight text-white px-2">
              <span className="flex items-center gap-2">
                <OrchentraLogo className="h-4 w-4 stroke-current stroke-[2.5] strokeLinecap-round strokeLinejoin-round" />
                orchentra
              </span>
            </Link>

            <Link
              href="https://github.com/Athrean/Orchentra"
              target="_blank"
              className="flex items-center gap-1.5 text-[13px] font-medium text-white/80 transition-colors hover:text-white"
            >
              <StarIcon className="h-3 w-3" />
              Star
            </Link>

            <div className="h-4 w-px bg-white/20" />

            <a
              href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/github`}
              className="flex items-center gap-1.5 text-[13px] font-bold text-accent transition-colors hover:text-white"
            >
              <GithubIcon className="h-3.5 w-3.5 fill-current" />
              Login
            </a>
          </nav>
        </div>
      </header>

      <main>
        <HeroSection />
        <Divider />
        <QuickstartSection />
        <Divider />
        <HowItWorksSection />
        <Divider />
        <FeaturesSection />
        <Divider />
        <UnderTheHoodSection />
        <Divider />
        <IntegrationsSection />
        <Divider />
        <IdentitySection />
        <Divider />
        <ProblemsSolvedSection />
        <Divider />
        <OpenSourceSection />
        <Divider />
        <CtaSection />
      </main>

      <Footer />
    </div>
  )
}

function HeroSection(): React.ReactNode {
  return (
    <section className="relative overflow-hidden pt-[35vh] pb-[15vh]">
      <div
        className="absolute inset-x-0 top-0 h-[85vh] pointer-events-none select-none z-0"
        style={{
          maskImage:
            'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.4) 80%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.4) 80%, rgba(0,0,0,0) 100%)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-banner.jpg"
          alt=""
          className="h-full w-full object-cover object-top saturate-[1.5] contrast-[1.1]"
        />
      </div>

      <div className="relative z-10 px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="fade-up font-display text-[clamp(2.5rem,6.5vw,5rem)] font-bold leading-[1.08] tracking-[-0.03em] text-text-primary drop-shadow-sm">
            <span className="bg-linear-to-r from-accent via-emerald-500 to-teal-500 bg-clip-text text-transparent">
              Orchentra
            </span>
            <br />
            Your CI breaks.
            <br />
            We find out why.
          </h1>

          <p className="fade-up-d1 mx-auto mt-7 max-w-[480px] text-[17px] leading-[1.7] text-text-secondary">
            An AI agent that reads your logs, queries your error tracker, and delivers a root-cause brief to Slack
            before your team even notices.
          </p>

          <div className="fade-up-d2 mt-9 flex justify-center">
            <div className="inline-flex h-[46px] items-center gap-6 rounded-full border border-border bg-white/70 px-7 shadow-[0_2px_12px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all hover:bg-white/90">
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/github`}
                className="group flex items-center gap-2 text-[14px] font-semibold text-text-primary transition-colors hover:text-accent"
              >
                <GithubIcon className="h-[15px] w-[15px]" />
                Login with GitHub
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>

              <div className="h-4 w-px bg-border/80" />

              <Link
                href="#setup"
                className="flex items-center gap-2 text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary"
              >
                Docs / Setup
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function QuickstartSection(): React.ReactNode {
  return (
    <section id="setup" className="pt-4 pb-24">
      <div className="mx-auto max-w-[1100px] px-6">
        <SectionHeading label="Quickstart" title="Open source. Self-hosted. Set up in one command." />
        <p className="mx-auto mt-5 max-w-lg text-center text-[15px] leading-relaxed text-text-secondary">
          Clone the repo, add your tokens, run. No migrations, no OAuth flows, no managed service. You own everything.
        </p>

        <div className="mx-auto mt-12 max-w-2xl">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 font-mono text-[11px] text-text-muted">terminal</span>
            </div>
            <pre className="overflow-x-auto px-6 py-5 font-mono text-[13px] leading-8 text-text-secondary">
              {`$ `}
              <span className="text-text-primary">git clone</span>
              {` `}
              <span className="text-accent">https://github.com/Athrean/Orchentra</span>
              {`
$ `}
              <span className="text-text-primary">cd</span>
              {` Orchentra && `}
              <span className="text-text-primary">cp</span>
              {` orchentra.yml.example orchentra.yml
$ `}
              <span className="text-text-primary">docker compose up</span>
              <span className="blink text-accent ml-1">▋</span>
            </pre>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="https://github.com/Athrean/Orchentra"
            target="_blank"
            className="group inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_2px_12px_rgba(16,185,129,0.2)] transition-all hover:brightness-105"
          >
            <GithubIcon className="h-4 w-4" />
            Star on GitHub
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            Read the docs&nbsp;&rarr;
          </Link>
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection(): React.ReactNode {
  return (
    <section id="how-it-works" className="py-24">
      <div className="mx-auto max-w-[1100px] px-6">
        <SectionHeading label="How it works" title="Manage incidents, not CI logs." />

        <div className="mt-16 space-y-10">
          {steps.map((s) => (
            <div key={s.num} className="mx-auto max-w-2xl">
              <div className="flex items-start gap-6">
                <span className="shrink-0 font-display text-[48px] font-bold leading-none text-surface-3">{s.num}</span>
                <div className="pt-2">
                  <h3 className="font-display text-xl font-semibold tracking-tight text-text-primary">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{s.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-3xl overflow-hidden rounded-2xl border border-border shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
          <div className="relative aspect-video bg-surface-1">
            <div
              className="absolute inset-0 opacity-15"
              style={{
                backgroundImage: "url('/hero-banner.jpg')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            <div className="absolute inset-0 bg-linear-to-t from-white via-white/60 to-transparent" />
            <div className="absolute inset-0 flex items-end justify-center px-8 pb-8">
              <SlackMockup />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SlackMockup(): React.ReactNode {
  return (
    <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-white shadow-xl">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
        <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
        <span className="h-2 w-2 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-[10px] text-text-muted"># incidents</span>
      </div>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 font-display text-xs font-bold text-accent">
            O
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[12px] font-semibold text-text-primary">Orchentra</span>
              <span className="font-mono text-[9px] text-text-muted">2:34 PM</span>
            </div>
            <div className="mt-1.5 rounded-lg border border-border bg-surface-1 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                CI &middot; deploy-api &middot; my-org/api
              </p>
              <p className="mt-2 text-[11px] leading-snug text-text-secondary">
                Missing{' '}
                <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[10px] text-accent">DATABASE_URL</code>{' '}
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
  )
}

function FeaturesSection(): React.ReactNode {
  return (
    <section id="features" className="py-24">
      <div className="mx-auto max-w-[1100px] px-6">
        <SectionHeading
          label="Features"
          title={
            <>
              Everything you need to triage
              <br className="hidden sm:block" />
              incidents autonomously.
            </>
          }
        />

        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-white p-7 transition-all duration-300 hover:border-border-hover hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
            >
              <h3 className="font-display text-[16px] font-semibold tracking-tight text-text-primary">{f.title}</h3>
              <p className="mt-2.5 text-[13px] leading-[1.7] text-text-secondary">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function UnderTheHoodSection(): React.ReactNode {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1100px] px-6">
        <SectionHeading label="Under the hood" title="How the agent thinks." />

        <div className="mt-16 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-white p-8">
            <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">
              ReAct reasoning loop
            </h3>
            <p className="mt-2 text-[14px] text-text-secondary">
              The agent doesn&apos;t guess. It runs a structured loop: observe, reason, act, repeat.
            </p>
            <div className="mt-6 space-y-2.5">
              {reactSteps.map((r, i) => (
                <div key={i} className={`flex items-start gap-3 rounded-lg border ${r.border} ${r.bg} p-3`}>
                  <span className={`shrink-0 font-mono text-[11px] font-semibold ${r.color}`}>{r.step}</span>
                  <span className="text-[12px] leading-relaxed text-text-secondary">{r.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex-1 rounded-2xl border border-border bg-white p-8">
              <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">
                Evidence-based conclusions
              </h3>
              <p className="mt-2 text-[14px] text-text-secondary">
                Every conclusion is backed by real data. Confidence scores reflect certainty, not hallucination.
              </p>
              <div className="mt-5 space-y-3">
                <div className="rounded-lg border border-border bg-surface-1 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-text-primary">Log evidence</span>
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">
                      3 matches
                    </span>
                  </div>
                  <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-5 text-text-muted">
                    {`Error: env var DATABASE_URL is not set
  at getDbConnection (src/db.ts:14)
  at runMigrations (src/db.ts:28)`}
                  </pre>
                </div>
                <div className="rounded-lg border border-border bg-surface-1 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-text-primary">Sentry correlation</span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-600">
                      high
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] text-text-secondary">
                    12 matching errors in production over the last 60 minutes. Same stack trace pattern.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-white p-8">
              <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">Full trace audit</h3>
              <p className="mt-2 text-[14px] text-text-secondary">
                Every tool call, API request, and decision logged. Nothing happens in the dark.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {auditTraceTools.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-border bg-surface-1 px-2.5 py-1 font-mono text-[11px] text-text-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function IntegrationsSection(): React.ReactNode {
  return (
    <section id="integrations" className="py-24">
      <div className="mx-auto max-w-[1100px] px-6">
        <SectionHeading
          label="Integrations"
          title={
            <>
              Connect your existing stack.
              <br className="hidden sm:block" />
              Add new ones in a single file.
            </>
          }
        />

        <div className="mx-auto mt-14 max-w-2xl">
          <div className="flex flex-wrap justify-center gap-3">
            {integrations.map((i) => (
              <span
                key={i.name}
                className={`rounded-full border px-5 py-2.5 text-[14px] font-medium transition-all ${
                  i.live
                    ? 'border-accent/30 bg-accent/5 text-accent'
                    : 'border-border bg-white text-text-muted hover:border-border-hover hover:text-text-secondary'
                }`}
              >
                {i.name}
                {!i.live && <span className="ml-1.5 text-[12px] opacity-50">soon</span>}
              </span>
            ))}
          </div>
          <p className="mt-7 text-center text-[13px] text-text-muted">
            Every integration is one TypeScript file.{' '}
            <Link
              href="https://github.com/Athrean/Orchentra"
              target="_blank"
              className="text-accent hover:underline underline-offset-4"
            >
              Add your own&nbsp;&rarr;
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}

function IdentitySection(): React.ReactNode {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1100px] px-6">
        <SectionHeading label="Identity" title="What Orchentra is." />

        <div className="mx-auto mt-14 max-w-2xl space-y-7">
          {identityItems.map((item, i) => (
            <div key={i} className="border-l-2 border-border pl-6 transition-colors hover:border-accent/50">
              <h3 className="font-display text-[17px] font-semibold tracking-tight text-text-primary">{item.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-text-secondary">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProblemsSolvedSection(): React.ReactNode {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1100px] px-6">
        <SectionHeading label="Problems solved" title="What changes with Orchentra." />

        <div className="mx-auto mt-14 max-w-3xl space-y-5">
          {problems.map((p, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-border">
              <div className="grid md:grid-cols-2">
                <div className="border-b border-border bg-surface-1 p-6 md:border-b-0 md:border-r">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-red-400">
                    Without
                  </span>
                  <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">{p.without}</p>
                </div>
                <div className="bg-accent/3 p-6">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">
                    With Orchentra
                  </span>
                  <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">{p.with}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function OpenSourceSection(): React.ReactNode {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1100px] px-6">
        <SectionHeading label="Open source" title="Extensible, adaptable, yours." />

        <div className="mx-auto mt-14 grid max-w-3xl gap-5 md:grid-cols-3">
          {openSourceCards.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-border bg-white p-6 transition-all duration-300 hover:border-border-hover hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
            >
              <h3 className="font-display text-[16px] font-semibold tracking-tight text-text-primary">{item.title}</h3>
              <p className="mt-2 text-[13px] leading-[1.7] text-text-secondary">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CtaSection(): React.ReactNode {
  return (
    <section className="relative overflow-hidden py-28">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "url('/hero-banner.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center 60%',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0.7) 40%, rgba(255,255,255,0.7) 60%, rgba(255,255,255,1) 100%)',
        }}
      />

      <div className="relative mx-auto max-w-[1100px] px-6 text-center">
        <h2 className="font-display text-[clamp(1.75rem,4vw,3rem)] font-bold tracking-tight text-text-primary">
          Get started
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-text-secondary">
          From zero to autonomous incident triage in one command.
        </p>

        <div className="mx-auto mt-8 max-w-xl">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <pre className="px-6 py-4 font-mono text-[14px] text-text-secondary">
              <span className="text-text-muted">$</span> <span className="text-text-primary">docker compose up</span>
              <span className="blink text-accent ml-1">▋</span>
            </pre>
          </div>
        </div>

        <p className="mx-auto mt-5 max-w-md text-[14px] leading-relaxed text-text-muted">
          Clone the repo. Add your GitHub token, Slack bot token, and Anthropic key. Run. That&apos;s it.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="https://github.com/Athrean/Orchentra"
            target="_blank"
            className="group inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_2px_12px_rgba(16,185,129,0.2)] transition-all hover:brightness-105"
          >
            <GithubIcon className="h-4 w-4" />
            Star on GitHub
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            Read the docs&nbsp;&rarr;
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer(): React.ReactNode {
  return (
    <footer className="relative mt-20 overflow-hidden border-t-0">
      <div className="absolute inset-0 pointer-events-none select-none z-0 bg-[#07131f]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-banner.jpg"
          alt=""
          className="absolute inset-x-0 bottom-0 w-full object-cover object-bottom opacity-80"
        />
        <div className="absolute inset-0 bg-linear-to-b from-[#0f1b29] via-[#0f1b29]/70 to-transparent z-10" />
        <div
          className="absolute inset-0 opacity-[0.25] mix-blend-overlay z-20"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      <div className="relative z-30 mx-auto max-w-[1100px] px-6 py-20">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-5">
          <div className="md:col-span-1">
            <span className="font-display text-[16px] font-bold tracking-tight text-white">orchentra</span>
            <p className="mt-3 text-[13px] leading-relaxed text-white/60">
              AI incident triage
              <br />
              for engineering teams.
            </p>
          </div>
          {footerCols.map((col) => (
            <div key={col.heading}>
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white">{col.heading}</span>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((lk) => (
                  <li key={lk.l}>
                    <Link
                      href={lk.h}
                      className="text-[13px] font-medium text-white/60 transition-colors hover:text-white"
                    >
                      {lk.l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex items-center justify-between border-t border-white/10 pt-7">
          <span className="text-[12px] font-medium text-white/40">
            &copy; {new Date().getFullYear()} Orchentra. Open source under MIT.
          </span>
          <Link
            href="https://github.com/Athrean/Orchentra"
            target="_blank"
            className="text-white/40 transition-colors hover:text-white"
          >
            <GithubIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </footer>
  )
}

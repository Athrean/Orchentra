import Link from 'next/link'

/* ═══════════ Icons ═══════════ */

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3.5 8h9M8.5 4l4 4-4 4" />
    </svg>
  )
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
    </svg>
  )
}

/* ═══════════ Data ═══════════ */

const steps = [
  {
    num: '01',
    title: 'Define the trigger',
    desc: 'Point Orchentra at your GitHub repo. It watches for workflow failures via webhooks — no polling, no cron, no config files.',
  },
  {
    num: '02',
    title: 'Agent investigates',
    desc: 'The AI agent fetches workflow logs, queries Sentry for correlated errors, and searches past incidents. Up to 6 reasoning rounds.',
  },
  {
    num: '03',
    title: 'Approve and act',
    desc: 'A structured brief appears in Slack with root cause, confidence score, and one-click actions. Humans decide, agents execute.',
  },
]

const features = [
  {
    title: '30-Second Briefs',
    desc: 'From CI failure to root cause brief in your Slack channel. Fetches logs, reasons about the failure, delivers a structured report.',
  },
  {
    title: 'ReAct Agent Loop',
    desc: 'Multi-step reasoning with tool calls. Decides what to investigate, fetches real data, observes results, iterates until confident.',
  },
  {
    title: 'Evidence-Based',
    desc: 'Every conclusion backed by actual log lines and error data. Confidence scores show certainty. No hallucinated fixes.',
  },
  {
    title: 'One-Click Actions',
    desc: 'Approve a fix, dig deeper, snooze, or dismiss — all from Slack buttons. Humans decide, agents execute.',
  },
  {
    title: 'Full Trace Audit',
    desc: 'Every tool call, API response, and reasoning step logged. Complete transparency into what the agent did and why.',
  },
  {
    title: 'Auto Postmortems',
    desc: 'On resolution, the agent drafts a blameless postmortem from gathered evidence. Engineers edit, not write from scratch.',
  },
]

const integrations: { name: string; live: boolean }[] = [
  { name: 'GitHub Actions', live: true },
  { name: 'Sentry', live: true },
  { name: 'Slack', live: true },
  { name: 'Datadog', live: false },
  { name: 'PagerDuty', live: false },
  { name: 'CircleCI', live: false },
  { name: 'Grafana', live: false },
  { name: 'Linear', live: false },
]

const identityItems = [
  {
    title: 'An incident response agent.',
    desc: 'Not a dashboard. Not a chatbot. A structured reasoning engine that investigates CI failures end-to-end.',
  },
  {
    title: 'A triage layer.',
    desc: 'Sits between your CI pipeline and your team. Filters noise, surfaces signal, delivers actionable briefs.',
  },
  {
    title: 'An evidence system.',
    desc: 'Every conclusion is backed by log lines, error traces, and historical patterns. Confidence scores, not guesses.',
  },
  {
    title: 'Full observability.',
    desc: 'Every tool call, every API request, every reasoning step — logged, traceable, auditable. Nothing happens in the dark.',
  },
  {
    title: 'A self-hosted runtime.',
    desc: "Your infrastructure, your data, your keys. No vendor lock-in. No external API calls you didn't authorize.",
  },
]

const problems = [
  {
    without: 'CI fails. An engineer gets paged. Spends 20 minutes reading logs.',
    with: 'CI fails. Orchentra reads the logs, finds the root cause, posts a brief. Engineer reads for 30 seconds.',
  },
  {
    without: 'Sentry errors pile up. Nobody connects them to the failed deploy.',
    with: 'The agent correlates Sentry errors with the CI failure automatically. Pattern matching across tools.',
  },
  {
    without: 'Same failure happens again next week. No one remembers the fix.',
    with: 'Historical pattern matching. The agent recognizes recurring failures and references past resolutions.',
  },
  {
    without: 'Postmortems are a chore. Written days later from memory.',
    with: 'Auto-generated postmortem from gathered evidence. Written immediately. Engineers review, not write.',
  },
]

const footerCols = [
  {
    heading: 'Product',
    links: [
      { l: 'Get Started', h: '#setup' },
      { l: 'Features', h: '#features' },
    ],
  },
  {
    heading: 'Platform',
    links: [
      { l: 'Integrations', h: '#integrations' },
      { l: 'How it works', h: '#how-it-works' },
    ],
  },
  {
    heading: 'Developers',
    links: [
      { l: 'Documentation', h: '/docs' },
      { l: 'GitHub', h: 'https://github.com/Athrean/Orchentra' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { l: 'Changelog', h: 'https://github.com/Athrean/Orchentra/releases' },
      { l: 'Contributing', h: 'https://github.com/Athrean/Orchentra' },
      { l: 'License', h: 'https://github.com/Athrean/Orchentra/blob/main/LICENSE' },
    ],
  },
]

/* ═══════════ Page ═══════════ */

export default function Page() {
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
                {/* Minimalist logo icon for the glass nav */}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4 stroke-current stroke-[2.5] strokeLinecap-round strokeLinejoin-round"
                >
                  <path d="m13.4 2.096c-1.332-1.332-3.498-1.332-4.83 0l-5.741 5.74c-1.333 1.334-1.333 3.499 0 4.832l1.325 1.325" />
                  <path d="m10.6 21.904c1.332 1.332 3.498 1.332 4.83 0l5.741-5.74c1.333-1.334 1.333-3.499 0-4.832l-1.325-1.325" />
                  <path d="m6.062 10.983c-1.127.348-2.456.037-3.32-.828-1.07-1.07-1.07-2.805 0-3.875l4.87-4.87c1.071-1.07 2.805-1.07 3.875 0h.001c.865.864 1.176 2.193.828 3.32" />
                  <path d="m17.938 13.017c1.127-.348 2.456-.037 3.32.828 1.07 1.07 1.07 2.805 0 3.875l-4.87 4.87c-1.071 1.07-2.805 1.07-3.875 0h-.001c-.865-.864-1.176-2.193-.828-3.32" />
                </svg>
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
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden pt-[35vh] pb-[15vh]">
          {/* Background Image Container */}
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

          {/* Foreground Content */}
          <div className="relative z-10 px-6">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="fade-up font-display text-[clamp(2.5rem,6.5vw,5rem)] font-bold leading-[1.08] tracking-[-0.03em] text-text-primary drop-shadow-sm">
                <span className="bg-gradient-to-r from-accent via-emerald-500 to-teal-500 bg-clip-text text-transparent">
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
                  <Link
                    href="#setup"
                    className="group flex items-center gap-2 text-[14px] font-semibold text-text-primary transition-colors hover:text-accent"
                  >
                    Get started
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>

                  <div className="h-4 w-[1px] bg-border/80" />

                  <Link
                    href="https://github.com/Athrean/Orchentra"
                    target="_blank"
                    className="flex items-center gap-2 text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                  >
                    <GithubIcon className="h-[15px] w-[15px]" />
                    GitHub
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Quickstart ── */}
        <Divider />
        <section id="setup" className="pt-4 pb-24">
          <div className="mx-auto max-w-[1100px] px-6">
            <SectionHeading label="Quickstart" title="Open source. Self-hosted. Set up in one command." />
            <p className="mx-auto mt-5 max-w-lg text-center text-[15px] leading-relaxed text-text-secondary">
              Clone the repo, add your tokens, run. No migrations, no OAuth flows, no managed service. You own
              everything.
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

        {/* ── How it works ── */}
        <Divider />
        <section id="how-it-works" className="py-24">
          <div className="mx-auto max-w-[1100px] px-6">
            <SectionHeading label="How it works" title="Manage incidents, not CI logs." />

            <div className="mt-16 space-y-10">
              {steps.map((s) => (
                <div key={s.num} className="mx-auto max-w-2xl">
                  <div className="flex items-start gap-6">
                    <span className="shrink-0 font-display text-[48px] font-bold leading-none text-surface-3">
                      {s.num}
                    </span>
                    <div className="pt-2">
                      <h3 className="font-display text-xl font-semibold tracking-tight text-text-primary">{s.title}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{s.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Slack mockup illustration */}
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
                <div className="absolute inset-0 bg-gradient-to-t from-white via-white/60 to-transparent" />
                <div className="absolute inset-0 flex items-end justify-center px-8 pb-8">
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
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <Divider />
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

        {/* ── Under the Hood ── */}
        <Divider />
        <section className="py-24">
          <div className="mx-auto max-w-[1100px] px-6">
            <SectionHeading label="Under the hood" title="How the agent thinks." />

            <div className="mt-16 grid gap-5 lg:grid-cols-2">
              {/* ReAct Loop */}
              <div className="rounded-2xl border border-border bg-white p-8">
                <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">
                  ReAct reasoning loop
                </h3>
                <p className="mt-2 text-[14px] text-text-secondary">
                  The agent doesn&apos;t guess. It runs a structured loop: observe, reason, act, repeat.
                </p>
                <div className="mt-6 space-y-2.5">
                  {[
                    {
                      step: 'Observe',
                      detail: 'Fetch GitHub Actions logs, parse error output',
                      color: 'text-blue-600',
                      bg: 'bg-blue-50',
                      border: 'border-blue-100',
                    },
                    {
                      step: 'Reason',
                      detail: '"Error references DATABASE_URL — checking if it\'s set in CI env"',
                      color: 'text-amber-600',
                      bg: 'bg-amber-50',
                      border: 'border-amber-100',
                    },
                    {
                      step: 'Act',
                      detail: 'Query Sentry for recent errors matching this pattern',
                      color: 'text-emerald-600',
                      bg: 'bg-emerald-50',
                      border: 'border-emerald-100',
                    },
                    {
                      step: 'Observe',
                      detail: 'Sentry confirms: 12 errors in last hour, same missing env var',
                      color: 'text-blue-600',
                      bg: 'bg-blue-50',
                      border: 'border-blue-100',
                    },
                    {
                      step: 'Synthesize',
                      detail: 'Root cause identified — confidence 92%. Draft brief.',
                      color: 'text-violet-600',
                      bg: 'bg-violet-50',
                      border: 'border-violet-100',
                    },
                  ].map((r, i) => (
                    <div key={i} className={`flex items-start gap-3 rounded-lg border ${r.border} ${r.bg} p-3`}>
                      <span className={`shrink-0 font-mono text-[11px] font-semibold ${r.color}`}>{r.step}</span>
                      <span className="text-[12px] leading-relaxed text-text-secondary">{r.detail}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evidence & Audit */}
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
                  <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">
                    Full trace audit
                  </h3>
                  <p className="mt-2 text-[14px] text-text-secondary">
                    Every tool call, API request, and decision logged. Nothing happens in the dark.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {['fetch_logs()', 'parse_errors()', 'query_sentry()', 'search_history()', 'synthesize()'].map(
                      (t) => (
                        <span
                          key={t}
                          className="rounded-md border border-border bg-surface-1 px-2.5 py-1 font-mono text-[11px] text-text-muted"
                        >
                          {t}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Integrations ── */}
        <Divider />
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

        {/* ── Identity ── */}
        <Divider />
        <section className="py-24">
          <div className="mx-auto max-w-[1100px] px-6">
            <SectionHeading label="Identity" title="What Orchentra is." />

            <div className="mx-auto mt-14 max-w-2xl space-y-7">
              {identityItems.map((item, i) => (
                <div key={i} className="border-l-2 border-border pl-6 transition-colors hover:border-accent/50">
                  <h3 className="font-display text-[17px] font-semibold tracking-tight text-text-primary">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-text-secondary">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Problems Solved ── */}
        <Divider />
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
                    <div className="bg-accent/[0.03] p-6">
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

        {/* ── Open Source ── */}
        <Divider />
        <section className="py-24">
          <div className="mx-auto max-w-[1100px] px-6">
            <SectionHeading label="Open source" title="Extensible, adaptable, yours." />

            <div className="mx-auto mt-14 grid max-w-3xl gap-5 md:grid-cols-3">
              {[
                {
                  title: 'Extensible',
                  desc: 'Add integrations, tools, and custom agents. Every extension is a TypeScript file — no plugin SDK, no marketplace.',
                },
                {
                  title: 'Adaptable',
                  desc: 'Swap the LLM provider. Change the notification channel. Adjust the reasoning loop. Fork it and make it yours.',
                },
                {
                  title: 'Open Source',
                  desc: 'MIT licensed. Full source code. No telemetry, no usage tracking, no vendor lock-in. Inspect every line.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-border bg-white p-6 transition-all duration-300 hover:border-border-hover hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
                >
                  <h3 className="font-display text-[16px] font-semibold tracking-tight text-text-primary">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-[1.7] text-text-secondary">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <Divider />
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
                  <span className="text-text-muted">$</span>{' '}
                  <span className="text-text-primary">docker compose up</span>
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
      </main>

      {/* ── Footer ── */}
      <footer className="relative mt-20 overflow-hidden border-t-0">
        <div className="absolute inset-0 pointer-events-none select-none z-0 bg-[#07131f]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-banner.jpg"
            alt=""
            className="absolute inset-x-0 bottom-0 w-full object-cover object-bottom opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f1b29] via-[#0f1b29]/70 to-transparent z-10" />
          {/* Grain Filter Overlay */}
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
    </div>
  )
}

/* ═══════════ Components ═══════════ */

function SectionHeading({ label, title }: { label: string; title: React.ReactNode }) {
  return (
    <div className="text-center">
      <span className="inline-block font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-accent">
        {label}
      </span>
      <h2 className="mt-4 font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-text-primary">
        {title}
      </h2>
    </div>
  )
}

function Divider() {
  return null
}

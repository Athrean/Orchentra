import { Container } from './Container'
import { CodeWindow } from './CodeWindow'
import { Reveal } from './Reveal'

export function Hero({ loginHref }: { loginHref: string }): React.ReactNode {
  return (
    <section className="mk-canvas relative overflow-hidden pb-24 pt-16 md:pb-32 md:pt-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px]"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 30% 20%, rgba(21, 101, 69, 0.10), transparent 70%)',
        }}
      />
      <Container>
        <div className="grid items-center gap-16 md:grid-cols-12">
          <div className="md:col-span-6">
            <Reveal delay={0}>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border mk-border-hairline mk-surface-soft px-3 py-1">
                <span className="block h-1.5 w-1.5 rounded-full bg-[var(--color-coral)]" />
                <span className="mk-caption-upper mk-text-body">Open source · v0.1 alpha</span>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="mk-display-xl mk-text-ink text-[44px] sm:text-[56px] md:text-[64px]">
                Your CI fails. Orchentra investigates.
              </h1>
            </Reveal>
            <Reveal delay={0.18}>
              <p className="mt-6 max-w-[520px] text-[18px] leading-[1.55] mk-text-body">
                An open-source AI agent that reads your GitHub Actions logs, queries observability tools, and delivers a
                root-cause brief on every pipeline failure — in 30 seconds.
              </p>
            </Reveal>
            <Reveal delay={0.28}>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <a
                  href={loginHref}
                  className="mk-coral inline-flex h-11 items-center rounded-lg px-6 text-[14px] font-medium transition hover:opacity-90"
                >
                  Start free with GitHub
                </a>
                <a
                  href="https://github.com/Athrean/Orchentra"
                  className="mk-canvas inline-flex h-11 items-center rounded-lg border mk-border-hairline px-6 text-[14px] font-medium mk-text-ink transition hover:mk-surface-soft"
                >
                  View on GitHub
                </a>
              </div>
            </Reveal>
            <Reveal delay={0.36}>
              <p className="mt-6 text-[13px] mk-text-muted">
                No credit card. Self-host or use the hosted control plane.
              </p>
            </Reveal>
          </div>
          <Reveal className="md:col-span-6" delay={0.2}>
            <CodeWindow
              title="incident-1842 · investigation"
              lines={[
                { prefix: '$', text: 'orchentra triage --incident 1842', tone: 'muted' },
                { text: '', tone: 'muted' },
                { prefix: '◆', text: 'webhook  workflow_run.failed   build_test #214', tone: 'amber' },
                { prefix: '→', text: 'reading logs · 412 lines from build_test', tone: 'muted' },
                { prefix: '→', text: 'git blame  src/auth/middleware.ts:42', tone: 'muted' },
                { prefix: '→', text: 'sentry  14× ECONNRESET in last 60min', tone: 'muted' },
                { prefix: '→', text: 'pr #1183  bumps undici 5.x → 6.x', tone: 'muted' },
                { text: '', tone: 'muted' },
                { prefix: '✓', text: 'root cause located', tone: 'amber' },
                {
                  text: 'undici 6.x default keep-alive triggers ECONNRESET against',
                  tone: 'default',
                },
                { text: 'auth-service when X-Forwarded-Host is empty.', tone: 'default' },
                { text: '', tone: 'muted' },
                { prefix: '→', text: 'suggested fix', tone: 'coral' },
                { text: 'pin undici to 5.28.4 or set keepAliveMsecs=0.', tone: 'default' },
                { text: '', tone: 'muted' },
                { prefix: '⏱', text: 'completed in 27.4s', tone: 'muted' },
              ]}
            />
          </Reveal>
        </div>
      </Container>
    </section>
  )
}

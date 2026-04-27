import { Container } from './Container'

const STEPS = [
  {
    n: '01',
    title: 'Webhook in.',
    body: 'GitHub fires workflow_run.failed. Orchentra catches it, opens an incident, and queues the agent — no plugins to install, no log shipping pipeline to maintain.',
    chip: 'POST /github/webhook',
  },
  {
    n: '02',
    title: 'Agent investigates.',
    body: 'Read-only tools fan out: failed-job logs, recent commits, the file at the failing line, related PRs, Sentry events. Every call is permission-scoped and audited.',
    chip: 'tool_calls × 6',
  },
  {
    n: '03',
    title: 'Brief out.',
    body: 'A structured root-cause brief lands in the dashboard with hypothesis, evidence links, suggested fix, and a /retry handle if you want a second pass.',
    chip: 'incident.briefed',
  },
]

export function HowItWorks(): React.ReactNode {
  return (
    <section id="how-it-works" className="mk-canvas py-24 md:py-32">
      <Container>
        <div className="mk-surface-dark overflow-hidden rounded-2xl px-8 py-16 md:px-16 md:py-20">
          <div className="mb-14 max-w-[680px]">
            <span className="mk-caption-upper text-[var(--color-accent-amber)]">How it works</span>
            <h2 className="mk-display-lg mt-3 text-[34px] mk-text-on-dark md:text-[44px]">
              Three steps from a red CI badge to a written-up root cause.
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="mk-surface-dark-elevated relative flex flex-col gap-4 rounded-xl p-8">
                <div className="flex items-center gap-3">
                  <span className="mk-mono mk-text-coral text-[13px] tracking-widest" aria-hidden="true">
                    {s.n}
                  </span>
                  <span className="block h-px flex-1 bg-white/10" />
                </div>
                <h3 className="mk-display-md mk-text-on-dark text-[24px]">{s.title}</h3>
                <p className="text-[14px] leading-[1.6] mk-text-on-dark-soft">{s.body}</p>
                <span className="mk-mono mk-surface-dark-soft mk-text-on-dark-soft mt-2 inline-flex w-fit items-center rounded-md px-2.5 py-1 text-[12px]">
                  {s.chip}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  )
}

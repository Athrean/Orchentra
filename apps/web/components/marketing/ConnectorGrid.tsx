import { Github } from 'lucide-react'
import { Container } from './Container'

type Status = 'live' | 'soon'

const CONNECTORS: Array<{ name: string; desc: string; glyph: string; status: Status; lucide?: 'github' }> = [
  {
    name: 'GitHub Actions',
    desc: 'Workflow runs, job logs, annotations.',
    glyph: 'GA',
    status: 'live',
    lucide: 'github',
  },
  {
    name: 'GitHub PRs',
    desc: 'Diffs, review threads, related commits.',
    glyph: 'PR',
    status: 'live',
    lucide: 'github',
  },
  { name: 'GitHub Issues', desc: 'Linked tickets, prior incidents.', glyph: 'IS', status: 'live', lucide: 'github' },
  { name: 'Sentry', desc: 'Error events tied to the failing build.', glyph: 'Se', status: 'soon' },
  { name: 'Datadog', desc: 'Metrics + APM traces during the failure window.', glyph: 'Dd', status: 'soon' },
  { name: 'Linear', desc: 'Open the right ticket from the brief.', glyph: 'Li', status: 'soon' },
  { name: 'PagerDuty', desc: 'On-call schedule + active incidents.', glyph: 'Pd', status: 'soon' },
  { name: 'Vercel', desc: 'Deployment + runtime logs.', glyph: 'Ve', status: 'soon' },
]

function Glyph({ name, lucide }: { name: string; lucide?: 'github' }): React.ReactNode {
  if (lucide === 'github') return <Github className="h-4 w-4 mk-text-ink" strokeWidth={2} />
  return <span className="mk-mono text-[12px] font-medium mk-text-ink">{name}</span>
}

export function ConnectorGrid(): React.ReactNode {
  return (
    <section id="integrations" className="mk-surface-soft py-24 md:py-32">
      <Container>
        <div className="mb-14 grid items-end gap-6 md:grid-cols-12">
          <div className="md:col-span-7">
            <span className="mk-caption-upper mk-text-coral">Integrations</span>
            <h2 className="mk-display-lg mk-text-ink mt-3 text-[34px] md:text-[44px]">
              Connect the tools your incidents already live in.
            </h2>
          </div>
          <p className="text-[15px] leading-[1.6] mk-text-body md:col-span-5">
            Orchentra ships with read-only GitHub access today. Sentry, Datadog, Linear, PagerDuty, and Vercel land next
            — each scoped through the same per-tool permission model so you grant exactly what the agent needs.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {CONNECTORS.map((c) => (
            <div
              key={c.name}
              className="mk-canvas relative flex flex-col gap-3 rounded-xl border mk-border-hairline p-5"
            >
              <div className="flex items-center justify-between">
                <div className="mk-surface-card inline-flex h-9 w-9 items-center justify-center rounded-lg">
                  <Glyph name={c.glyph} lucide={c.lucide} />
                </div>
                {c.status === 'soon' && (
                  <span className="mk-surface-card mk-text-muted rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide">
                    Soon
                  </span>
                )}
              </div>
              <h3 className="text-[15px] font-medium mk-text-ink">{c.name}</h3>
              <p className="text-[13px] leading-[1.5] mk-text-body">{c.desc}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}

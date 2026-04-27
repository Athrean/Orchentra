import { FileSearch, Workflow, Sparkles } from 'lucide-react'
import { Container } from './Container'

const FEATURES = [
  {
    icon: FileSearch,
    title: 'Reads what humans read',
    body: 'Pulls failed-job logs, walks the diff, scans related PRs and recent commits. The agent works the same evidence trail your senior engineer would.',
  },
  {
    icon: Workflow,
    title: 'Real multi-tool investigations',
    body: 'Calls GitHub, Sentry, your file tree, search — with retries, audit logs, and per-tool permissions. Every step is replayable.',
  },
  {
    icon: Sparkles,
    title: 'A brief, not a chatbot',
    body: 'Posts a structured root-cause brief: hypothesis, evidence with links, suggested fix. No prompt engineering. No follow-up nags.',
  },
]

export function FeatureGrid(): React.ReactNode {
  return (
    <section id="features" className="mk-canvas py-24 md:py-32">
      <Container>
        <div className="mb-14 max-w-[640px]">
          <span className="mk-caption-upper mk-text-coral">Why Orchentra</span>
          <h2 className="mk-display-lg mk-text-ink mt-3 text-[36px] md:text-[48px]">
            Built like a senior engineer would investigate.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="mk-surface-card flex flex-col rounded-xl p-8">
              <div className="mk-canvas mb-6 inline-flex h-10 w-10 items-center justify-center rounded-lg border mk-border-hairline">
                <f.icon className="h-4 w-4 mk-text-coral" strokeWidth={2} />
              </div>
              <h3 className="text-[18px] font-medium mk-text-ink">{f.title}</h3>
              <p className="mt-3 text-[15px] leading-[1.55] mk-text-body">{f.body}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  )
}

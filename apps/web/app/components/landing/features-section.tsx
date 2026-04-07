import Link from 'next/link'
import { ArrowRight } from '../icons'
import { ShieldIcon, SparklesIcon, LayersIcon } from '../animate-icons'
import { SectionHeading } from '../landing-ui'
import { valueProps, capabilities } from '../../data/landing'

export function ValuePropSection(): React.ReactNode {
  return (
    <section className="bg-surface-0 py-24 md:py-32">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="text-center">
          <h2 className="font-serif text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.15] tracking-tight text-text-primary">
            The AI for incident response
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-text-secondary">
            Self-hosted. Open source. Set up in one command.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[13px] text-text-muted">
            <span>Get started:</span>
            <code className="rounded-[16px] border border-border bg-surface-1 px-3 py-1 font-mono text-[12px] text-text-primary">
              git clone
            </code>
            <code className="rounded-[16px] border border-border bg-surface-1 px-3 py-1 font-mono text-[12px] text-text-primary">
              configure
            </code>
            <code className="rounded-[16px] border border-border bg-surface-1 px-3 py-1 font-mono text-[12px] text-text-primary">
              docker compose up
            </code>
          </div>
        </div>

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
                    ? 'shadow-elevated border-accent bg-accent text-white'
                    : i < 4
                      ? 'border-accent/30 bg-accent/5 text-accent'
                      : i < 8
                        ? 'border-border bg-surface-1 text-text-primary'
                        : 'border-border bg-surface-1 text-text-muted'
                }`}
              >
                {node}
                {i >= 8 && <span className="ml-1 text-[11px] opacity-50">soon</span>}
              </span>
            ))}
          </div>

          <div className="mx-auto mt-2 h-8 w-px bg-linear-to-b from-border to-transparent" />
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {valueProps.map((v, i) => (
            <div key={i} className="group">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-1 text-text-secondary">
                {i === 0 && <LayersIcon size={16} />}
                {i === 1 && <ShieldIcon size={16} />}
                {i === 2 && <SparklesIcon size={16} />}
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

export function CapabilitiesSection(): React.ReactNode {
  return (
    <section id="features" className="bg-surface-1 py-24 md:py-32">
      <div className="mx-auto max-w-[1440px] px-6">
        <SectionHeading icon={<ShieldIcon size={28} />} title="Orchentra capabilities" />

        <div className="mx-auto mt-14 max-w-3xl space-y-4">
          {capabilities.map((cap) => (
            <div
              key={cap.name}
              className="shadow-elevated group rounded-[32px] border border-border bg-surface-2 p-8 transition-all duration-300"
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
                  className="inline-flex items-center gap-1.5 rounded-[22px] bg-accent/10 px-4 py-2 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/15"
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

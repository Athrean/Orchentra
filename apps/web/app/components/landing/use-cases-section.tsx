import { ArrowRight } from '../icons'
import { TerminalIcon } from '../animate-icons'
import { SectionHeading } from '../landing-ui'
import { getLoginUrl } from '../../lib/get-login-url'
import { useCases } from '../../data/landing'

export function UseCasesSection(): React.ReactNode {
  return (
    <section id="use-cases" className="bg-surface-1 py-24 md:py-32">
      <div className="mx-auto max-w-[1440px] px-6">
        <SectionHeading
          icon={<TerminalIcon size={28} />}
          title={
            <>
              How you can use
              <br className="hidden sm:block" />
              Orchentra
            </>
          }
        />

        <div className="mx-auto mt-8 flex flex-wrap justify-center gap-2">
          {useCases.map((uc, i) => (
            <span
              key={uc.category}
              className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition-all ${
                i === 0
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-surface-2 text-text-secondary hover:border-border-hover'
              }`}
            >
              {uc.category}
            </span>
          ))}
        </div>

        <div className="mt-14 space-y-8">
          {useCases.map((uc, i) => (
            <div key={uc.category} className="overflow-hidden rounded-[32px] border border-border bg-surface-2">
              <div className="grid md:grid-cols-2">
                <div className={`p-8 md:p-10 ${i % 2 === 1 ? 'md:order-2' : ''}`}>
                  <span className="inline-block rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent">
                    {uc.category}
                  </span>
                  <h3 className="mt-4 font-serif text-[24px] leading-[1.2] text-text-primary">{uc.title}</h3>
                  <p className="mt-3 text-[14px] leading-[1.7] text-text-secondary">{uc.description}</p>
                </div>

                <div
                  className={`border-t border-border bg-surface-2/50 p-8 md:border-t-0 md:p-10 ${i % 2 === 1 ? 'md:order-1 md:border-r' : 'md:border-l'}`}
                >
                  <div className="shadow-elevated rounded-[28px] border border-border bg-surface-1 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
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

export function CTABanner(): React.ReactNode {
  return (
    <section className="bg-surface-0 py-16">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="flex flex-col items-center justify-between gap-6 rounded-[32px] border border-border bg-surface-1 px-8 py-8 sm:flex-row sm:px-12">
          <h2 className="font-serif text-[clamp(1.25rem,3vw,1.75rem)] text-text-primary">
            What CI failure are you up against?
          </h2>
          <a
            href={getLoginUrl()}
            className="shadow-elevated inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-6 py-3 text-[14px] font-semibold text-white transition-all hover:bg-accent-hover"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

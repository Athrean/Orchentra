import { Container } from './Container'

export function CoralCTA({ loginHref }: { loginHref: string }): React.ReactNode {
  return (
    <section className="mk-canvas pb-24 pt-8 md:pb-32">
      <Container>
        <div className="mk-coral overflow-hidden rounded-2xl px-8 py-16 md:px-16 md:py-20">
          <div className="grid items-end gap-10 md:grid-cols-12">
            <div className="md:col-span-8">
              <span className="mk-caption-upper mk-text-on-dark">Get started</span>
              <h2
                className="mk-display-lg mt-3 text-[36px] leading-[1.05] md:text-[52px]"
                style={{ color: 'var(--color-on-primary)' }}
              >
                Stop reading logs at 3am.
              </h2>
              <p className="mt-6 max-w-[560px] text-[16px] leading-[1.6]" style={{ color: 'var(--color-on-primary)' }}>
                Hook Orchentra into one repo. The next time CI fails, read the brief instead of the logs.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:col-span-4 md:justify-end">
              <a
                href={loginHref}
                className="mk-btn-on-coral inline-flex h-11 items-center rounded-lg px-6 text-[14px] font-medium"
              >
                Start free with GitHub
              </a>
              <a
                href="https://github.com/Athrean/Orchentra"
                className="text-[14px] font-medium"
                style={{ color: 'var(--color-on-primary)' }}
              >
                Read the docs →
              </a>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}

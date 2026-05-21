import Link from 'next/link'
import { ASCIIMascot } from './ASCIIMascot'

export function Hero({ loginHref }: { loginHref: string }) {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-14 pb-20">
      {/* tabular header strip */}
      <div className="flex items-center justify-between border-y border-[var(--color-pg-hairline)] py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-pg-text-mute)]">
        <span>visual identity</span>
        <span className="hidden md:block">follow us · x, github</span>
        <span>[01]</span>
        <span>↳ next</span>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-[1fr_1.1fr] md:items-center">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-[var(--color-pg-text-mute)]">
            athrean · orchentra
          </div>

          <h1 className="mt-8 text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-[var(--color-pg-text-0)] md:text-[3.6rem]">
            the DevOps runtime
            <br />
            that remembers every
            <br />
            execution.
          </h1>
          <p className="mt-6 max-w-xl text-base text-[var(--color-pg-text-mute)] md:text-lg">
            one operations registry. CLI, MCP, and a graph that survives the incident.
          </p>

          <div
            className="mt-8 inline-flex items-center gap-3 border border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] px-4 py-3 text-sm"
            aria-label="install command"
          >
            <span className="text-[var(--color-pg-text-mute)]">$</span>
            <code className="text-[var(--color-pg-text-0)]">pnpm i -g @orchentra/cli</code>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <Link
              href={loginHref}
              className="border border-[var(--color-pg-accent-coral)] bg-[var(--color-pg-accent-coral)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-pg-accent-coral-2)] hover:border-[var(--color-pg-accent-coral-2)]"
            >
              sign in
            </Link>
            <Link
              href="/docs"
              className="border border-[var(--color-pg-text-0)] px-5 py-2.5 text-sm text-[var(--color-pg-text-0)] transition-colors hover:bg-[var(--color-pg-text-0)] hover:text-[var(--color-pg-surface-0)]"
            >
              docs
            </Link>
          </div>
        </div>

        <div className="overflow-hidden">
          <ASCIIMascot />
        </div>
      </div>
    </section>
  )
}

// apps/web/components/marketing-v2/Hero.tsx
import Link from 'next/link'

export function Hero({ loginHref }: { loginHref: string }) {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start gap-10 px-6 pt-24 pb-20 md:flex-row md:items-center md:justify-between md:pt-32">
      <div className="max-w-2xl">
        <h1 className="text-[2.5rem] font-semibold leading-[1.1] tracking-tight text-[var(--color-pg-text-0)] md:text-[3.25rem]">
          the DevOps runtime that remembers every execution
        </h1>
        <p className="mt-5 text-base text-[var(--color-pg-text-mute)] md:text-lg">
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
            className="border border-[var(--color-pg-accent-coral)] bg-[var(--color-pg-accent-coral)] px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-[var(--color-pg-accent-coral-2)] hover:border-[var(--color-pg-accent-coral-2)]"
          >
            sign in
          </Link>
          <Link
            href="/docs"
            className="border border-[var(--color-pg-hairline)] px-5 py-2.5 text-sm text-[var(--color-pg-text-0)] transition-colors hover:border-[var(--color-pg-text-mute)]"
          >
            docs
          </Link>
        </div>
      </div>

      <DitheredMascot />
    </section>
  )
}

function DitheredMascot() {
  return (
    <svg
      viewBox="0 0 200 200"
      className="h-48 w-48 shrink-0 text-[var(--color-pg-accent-coral)] md:h-64 md:w-64"
      aria-hidden="true"
    >
      <defs>
        <pattern id="pg-mascot-dither" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.9" fill="currentColor" />
        </pattern>
      </defs>
      <circle cx="100" cy="100" r="80" fill="url(#pg-mascot-dither)" opacity="0.9" />
      <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <circle cx="80" cy="92" r="4" fill="var(--color-pg-surface-0)" />
      <circle cx="120" cy="92" r="4" fill="var(--color-pg-surface-0)" />
      <path
        d="M 80 120 Q 100 130 120 120"
        stroke="var(--color-pg-surface-0)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

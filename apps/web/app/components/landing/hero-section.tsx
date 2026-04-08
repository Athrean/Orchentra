import Link from 'next/link'
import { GithubIcon, ArrowRight } from '../icons'
import { HeroIllustration } from '../hero-illustration'
import { getLoginUrl } from '../../lib/get-login-url'

export function HeroSection(): React.ReactNode {
  return (
    <section className="hero-bg relative min-h-screen overflow-hidden">
      <div className="h-20 md:h-24" />

      <div className="mx-auto flex w-full max-w-[1440px] min-h-[calc(100vh-5rem)] md:min-h-[calc(100vh-6rem)] flex-col md:flex-row items-center px-6">
        <div className="flex flex-col justify-center w-full md:w-1/2 pt-10 pb-8 md:py-0 order-2 md:order-1">
          <h1 className="hero-text fade-up font-serif text-[clamp(2.25rem,5vw,4.5rem)] leading-[1.08] tracking-tight">
            Meet your
            <br />
            incident triage
            <br />
            partner
          </h1>
          <p className="hero-text-secondary fade-up-d1 mt-5 max-w-[480px] text-[15px] leading-[1.7]">
            Tackle any CI failure with AI-powered root cause analysis. Orchentra reads your logs, finds the root cause,
            and delivers a brief — before your team even notices.
          </p>

          <div className="fade-up-d2 mt-8 flex flex-wrap items-center gap-4">
            <a
              href={getLoginUrl()}
              className="shadow-elevated inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[14px] font-semibold text-white transition-all hover:bg-accent-hover"
            >
              <GithubIcon className="h-4 w-4" />
              Login with GitHub
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/docs"
              className="hero-text-secondary text-[14px] font-semibold transition-colors hover:text-(--color-hero-text)"
            >
              Read the docs &rarr;
            </Link>
          </div>

          <div className="fade-up-d3 mt-6 flex flex-wrap gap-2">
            {['Triage', 'Investigate', 'Resolve'].map((tag) => (
              <span
                key={tag}
                className="hero-text-muted hero-border rounded-full border px-4 py-1.5 text-[12px] font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center w-full md:w-1/2 order-1 md:order-2 pt-4 md:pt-0">
          <HeroIllustration className="w-[230px] sm:w-[280px] md:w-[340px] lg:w-[410px] xl:w-[460px]" />
        </div>
      </div>
    </section>
  )
}

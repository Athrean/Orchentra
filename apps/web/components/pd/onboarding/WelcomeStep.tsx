'use client'

import Image from 'next/image'
import { ArrowRight, GitPullRequest, LineChart, Zap } from 'lucide-react'
import { Button } from '../ui/button'

const BULLETS = [
  {
    icon: GitPullRequest,
    title: 'Install in 60 seconds',
    body: 'Connect Orchentra to GitHub. Pick repos. Done.',
  },
  {
    icon: Zap,
    title: 'See every CI failure in one place',
    body: 'Workflow runs, failures, and MTTR — without leaving the dashboard.',
  },
  {
    icon: LineChart,
    title: 'Insights that actually move',
    body: 'Spot flakes, regressions, and quiet repos before they become incidents.',
  },
] as const

interface WelcomeStepProps {
  busy: boolean
  onContinue: () => void
}

export function WelcomeStep({ busy, onContinue }: WelcomeStepProps) {
  return (
    <section className="flex flex-col items-center gap-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <Image
          src="/mascot.svg"
          alt="Orchentra"
          width={56}
          height={56}
          priority
          className="opacity-95 [filter:invert(1)]"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-light">Welcome to Orchentra</h1>
          <p className="max-w-md text-sm text-light/70">
            The operations runtime for engineers shipping every day. Let&apos;s wire your repos in under two minutes.
          </p>
        </div>
      </div>

      <ul className="flex w-full max-w-md flex-col gap-3 text-left">
        {BULLETS.map((b) => (
          <li key={b.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-pg-accent-green)]/20 text-[var(--color-pg-accent-green-2)]">
              <b.icon className="h-3.5 w-3.5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-light">{b.title}</span>
              <span className="text-xs text-light/65">{b.body}</span>
            </div>
          </li>
        ))}
      </ul>

      <Button
        size="lg"
        onClick={onContinue}
        loading={busy}
        disabled={busy}
        className="bg-[var(--color-pg-accent-green)] text-white hover:bg-[var(--color-pg-accent-green-2)]"
      >
        Get started
        <ArrowRight className="h-4 w-4" />
      </Button>
    </section>
  )
}

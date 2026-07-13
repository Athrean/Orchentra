'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const GITHUB_URL = 'https://github.com/Athrean/Orchentra'
const INSTALL_COMMAND = 'npm install -g @orchentra/cli'

const frame = 'mx-auto w-full max-w-[1180px]'
const shell = 'mx-auto w-full max-w-[1180px] px-5 sm:px-6'
const eyebrow = 'font-[family-name:var(--font-mono)] text-[12px] uppercase leading-[1.35] text-[#10A37F]'
const buttonBase =
  'group inline-flex h-11 items-center justify-center gap-3 border px-5 text-[15px] font-semibold transition duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10A37F] focus-visible:ring-offset-2 focus-visible:ring-offset-base'
const ghostButton = `${buttonBase} border-ink/20 bg-transparent text-ink hover:border-ink/60`
const emeraldButton = `${buttonBase} border-[#10A37F] bg-[#10A37F] text-black hover:bg-[#0e8c6d]`

const sectionRailItems = [
  { id: 'runtime', label: 'Agent spine' },
  { id: 'flow', label: 'How it works' },
  { id: 'commands', label: 'Command surface' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
] as const

const sectionIds = sectionRailItems.map((section) => section.id)

const workSteps = [
  {
    title: 'Read',
    body: 'Read the repo before touching it.',
  },
  {
    title: 'Plan',
    body: 'Pick the smallest checkable path.',
  },
  {
    title: 'Patch',
    body: 'Patch in the project’s style.',
  },
  {
    title: 'Verify',
    body: 'Run the gate, then trust it.',
  },
  {
    title: 'Explain',
    body: 'Report outcome without filler.',
  },
]

const runtimeCards = [
  {
    index: '01',
    label: 'terse',
    title: 'Spends fewer tokens.',
    body: 'Short output, budgeted context, visible usage. Code, paths, errors, and safety text stay exact.',
    signal: '/terse ultra',
    image: '/heads/1.png',
  },
  {
    index: '02',
    label: 'budget',
    title: 'Keeps context under control.',
    body: 'Tool output caps and compaction receipts keep long sessions useful without flooding the model.',
    signal: '/status',
    image: '/heads/2.png',
  },
  {
    index: '03',
    label: 'lean',
    title: 'Writes less, better code.',
    body: 'YAGNI, stdlib, native, existing dependency, one line, then custom code. In that order.',
    signal: '/review',
    image: '/heads/3.png',
  },
  {
    index: '04',
    label: 'plan',
    title: 'Plans before files move.',
    body: 'Best route, named alternatives, scaffold, and checks before implementation starts.',
    signal: '/plan <need>',
    image: '/heads/4.png',
  },
  {
    index: '05',
    label: 'build',
    title: 'Builds in vertical slices.',
    body: 'Small repo-aware diffs, project conventions, checks after each slice.',
    signal: '/build <need>',
    image: '/heads/5.png',
  },
  {
    index: '06',
    label: 'review',
    title: 'Proves its review.',
    body: 'Findings are proposals. Tests, typechecks, builds, and repros decide what is real.',
    signal: '/review',
    image: '/heads/6.png',
  },
]

const flowRows = [
  ['Read', 'Map the repository before acting, including scripts, frameworks, dirty files, and local conventions.'],
  ['Plan', 'Name the path, tradeoffs, and checks so implementation has a finish line.'],
  ['Patch', 'Make focused edits in the right files and keep unrelated churn out of the diff.'],
  ['Verify', 'Run the closest meaningful gate and separate confirmed failures from speculation.'],
  ['Explain', 'Close with changed files, commands, outcomes, and any remaining risk.'],
]

const commands = [
  ['/plan <need>', 'Architecture, alternatives, scaffold, checks.'],
  ['/build <need>', 'Vertical slices, repo-aware patches, gates.'],
  ['/review', 'Findings first, verification attached.'],
  ['/scan', 'A lighter pass over a tree, file, or diff.'],
  ['/terse <mode>', 'Less prose, visible spend.'],
  ['session import', 'Bring prior agent sessions forward.'],
]

type PlanTone = 'grey' | 'emerald' | 'white'

const plans: Array<{
  name: string
  price: string
  priceNote: string
  description: string
  action: string
  tone: PlanTone
  image: string
  features: string[]
}> = [
  {
    name: 'Install',
    price: 'BYOK',
    priceNote: 'your keys',
    description: 'Put the crew in your terminal.',
    action: 'Open GitHub',
    tone: 'grey',
    image: '/heads/1.png',
    features: [
      'orchentra and otr binaries',
      'Bring your own provider keys',
      'Repo-local skills and hooks',
      'JSONL sessions',
    ],
  },
  {
    name: 'Operate',
    price: 'Local-first',
    priceNote: 'zero DB',
    description: 'Keep work in git and sessions on disk.',
    action: 'Read the README',
    tone: 'emerald',
    image: '/heads/3.png',
    features: [
      'No database in the CLI',
      'No hosted code workspace required',
      'Visible token and cost receipts',
      'Verification gates in the terminal',
    ],
  },
  {
    name: 'Scale',
    price: 'Deferred',
    priceNote: 'later',
    description: 'Hosted credit resale stays outside the CLI core.',
    action: 'Track releases',
    tone: 'white',
    image: '/heads/5.png',
    features: [
      'BYOK remains the default',
      'Provider routing can stay private',
      'Policy travels with repos',
      'No telemetry by default',
    ],
  },
]

const planTones: Record<PlanTone, { name: string; tile: string; button: string }> = {
  grey: {
    name: 'text-ink',
    tile: 'bg-[#d4d4d8]',
    button: `${buttonBase} border-[#d4d4d8] bg-[#d4d4d8] text-black hover:bg-[#e8e8ec]`,
  },
  emerald: {
    name: 'text-[#10A37F]',
    tile: 'bg-[#10A37F]',
    button: emeraldButton,
  },
  white: {
    name: 'text-ink/60',
    tile: 'bg-white',
    button: `${buttonBase} border-ink/15 bg-white text-black hover:bg-white/85`,
  },
}

const faqs = [
  {
    question: 'Is Orchentra a model provider?',
    answer: 'No. Orchentra is the crew and spine around your model route: plan, build, review, budget, verify.',
  },
  {
    question: 'Is Orchentra hosted?',
    answer:
      'No. The product runs from your terminal, works against your checkout, stores sessions locally, and ships through CLI plus git.',
  },
  {
    question: 'How is it different from a normal coding chat?',
    answer: 'It works from the repo outward: read, plan, patch, run, report. The check output beats the prose.',
  },
  {
    question: 'What happens when a check fails?',
    answer:
      'The failure is the source of truth. Orchentra separates proposed findings from evidence produced by real gates.',
  },
  {
    question: 'Does it store private code?',
    answer:
      'The CLI is local-first. Provider traffic depends on your model route; Orchentra does not require a hosted workspace or app database.',
  },
]

type SocialName = 'x' | 'github' | 'linkedin' | 'reddit' | 'discord'

const socialLinks: Array<{ name: SocialName; label: string; href: string }> = [
  { name: 'x', label: 'X', href: '#' },
  { name: 'github', label: 'GitHub', href: GITHUB_URL },
  { name: 'linkedin', label: 'LinkedIn', href: '#' },
  { name: 'reddit', label: 'Reddit', href: '#' },
  { name: 'discord', label: 'Discord', href: '#' },
]

export default function Page(): React.ReactNode {
  return (
    <main className="min-h-screen bg-base text-ink">
      <Nav />
      <Hero />
      <WorkLoopBanner />
      <SectionRail />
      <Runtime />
      <Flow />
      <CommandWall />
      <Pricing />
      <FAQ />
      <Footer />
    </main>
  )
}

function Logo({ size = 40 }: { size?: number }): React.ReactNode {
  return (
    <>
      <Image src="/black-logo.svg" alt="" width={size} height={size} priority className="object-contain dark:hidden" />
      <Image
        src="/white-logo.svg"
        alt=""
        width={size}
        height={size}
        priority
        className="hidden object-contain dark:block"
      />
    </>
  )
}

function Nav(): React.ReactNode {
  return (
    <header className="sticky top-0 z-50 border-b border-ink/10 bg-base/90 backdrop-blur">
      <nav className={`${shell} flex h-[72px] items-center justify-between gap-5`} aria-label="Main navigation">
        <a href="#" aria-label="Orchentra home" className="flex items-center gap-2">
          <Logo />
          <span className="text-[21px] font-semibold tracking-[-0.02em]">Orchentra</span>
        </a>

        <div className="hidden items-center gap-8 text-[15px] text-ink/60 md:flex">
          <a className="transition hover:text-ink" href="#runtime">
            Runtime
          </a>
          <a className="transition hover:text-ink" href="#commands">
            Commands
          </a>
          <a className="transition hover:text-ink" href="#pricing">
            Pricing
          </a>
          <a className="transition hover:text-ink" href="#faq">
            FAQ
          </a>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={GITHUB_URL}
            className="hidden sm:inline-flex sm:h-11 sm:items-center sm:border sm:border-ink/20 sm:bg-transparent sm:px-5 sm:text-[15px] sm:font-semibold sm:text-ink sm:transition sm:hover:border-ink/60"
          >
            GitHub
          </a>
          <a href={GITHUB_URL} className={emeraldButton}>
            Start
            <span className="transition group-hover:translate-x-1">→</span>
          </a>
        </div>
      </nav>
    </header>
  )
}

function Hero(): React.ReactNode {
  return (
    <section className="relative overflow-hidden bg-base">
      {/* 6 Column Cards Background */}
      <div className="absolute inset-0 grid grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((num) => (
          <div key={num} className="group relative h-full cursor-pointer border-l border-ink/[0.04] first:border-l-0">
            <EdgeOverlay headImage={`/heads/${num}.png`} />
          </div>
        ))}
      </div>

      <div
        className={`${shell} relative z-10 flex min-h-[650px] flex-col items-center justify-center py-16 text-center md:py-20 pointer-events-none`}
      >
        <a
          href="#runtime"
          className="group inline-flex items-center border border-[#10A37F]/40 bg-base text-[13px] text-ink/85 pointer-events-auto"
        >
          <span className="border-r border-[#10A37F]/40 px-3 py-2 font-[family-name:var(--font-mono)] text-[#10A37F]">
            New
          </span>
          <span className="px-3 py-2">CLI-first coding crew</span>
          <span className="border-l border-[#10A37F]/40 px-3 py-2 transition group-hover:translate-x-1">→</span>
        </a>

        <h1 className="mt-10 max-w-[1120px] text-[52px] font-semibold leading-[0.96] tracking-[-0.01em] text-ink sm:text-[78px] lg:text-[96px] pointer-events-auto">
          Spends less. Writes less. Proves its work.
        </h1>

        <p className="mt-8 max-w-[720px] text-[18px] leading-8 text-ink/60 pointer-events-auto">
          A coding crew in your terminal: fewer tokens, leaner diffs, review that runs the checks. Bring your own
          provider key.
        </p>

        <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row pointer-events-auto">
          <a href={GITHUB_URL} className={emeraldButton}>
            Install the CLI
            <span className="transition group-hover:translate-x-1">→</span>
          </a>
          <a href="#pricing" className={ghostButton}>
            View pricing
          </a>
        </div>

        <div className="mt-3 w-full max-w-[430px] pointer-events-auto">
          <CopyCommand command={INSTALL_COMMAND} className="w-full" />
        </div>
      </div>
    </section>
  )
}

function WorkLoopBanner(): React.ReactNode {
  return (
    <section className="border-y border-ink/10 bg-panel text-ink">
      <div className={`${frame} grid border-l border-ink/10 sm:grid-cols-5`}>
        {workSteps.map((step, index) => (
          <div key={step.title} className="min-h-[150px] border-b border-r border-ink/10 p-5 sm:border-b-0">
            <div className="flex items-center justify-between font-[family-name:var(--font-mono)] text-[12px] uppercase">
              <span className="text-[#10A37F]">{step.title}</span>
              <span className="text-ink/25">{String(index + 1).padStart(2, '0')}</span>
            </div>
            <p className="mt-5 text-[14px] leading-6 text-ink/60">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function SectionRail(): React.ReactNode {
  const activeId = useActiveSection(sectionIds)
  const activeIndex = Math.max(
    0,
    sectionRailItems.findIndex((section) => section.id === activeId),
  )
  const activeSection = sectionRailItems[activeIndex] ?? sectionRailItems[0]

  return (
    <section className="sticky top-[72px] z-40 border-b border-ink/10 bg-base/95 backdrop-blur">
      <div className={`${frame} border-x border-ink/10`}>
        <div className="flex h-11 items-center justify-between gap-2 px-5 font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.1em] sm:gap-4 sm:px-6 sm:tracking-[0.16em]">
          <a href={`#${activeSection.id}`} className="flex min-w-0 items-center gap-3 text-ink/50">
            <span className="text-[#10A37F]">›</span>
            <span className="truncate">{activeSection.label}</span>
          </a>
          <span className="shrink-0 text-[#10A37F]">
            [{activeIndex + 1}/{sectionRailItems.length}]
          </span>
        </div>
      </div>
    </section>
  )
}

function Runtime(): React.ReactNode {
  return (
    <section id="runtime" className="scroll-mt-[132px] bg-base py-20 sm:py-28">
      <div className={frame}>
        <div className="px-5 sm:px-6">
          <SectionIntro
            marker="01 / runtime"
            title="The spine is the product."
            body="Every agent carries the same spine: terse output, budgeted context, lean code, and verification by running."
          />
        </div>

        <div className="grid border-l border-t border-ink/10 md:grid-cols-2 lg:grid-cols-3">
          {runtimeCards.map((card) => (
            <article
              key={card.index}
              className="group relative min-h-[320px] overflow-hidden border-b border-r border-ink/10 bg-base p-6 transition duration-200 hover:-translate-y-1 hover:border-ink/50"
            >
              <EdgeOverlay headImage={card.image} />
              <div className="relative z-10">
                <div className="flex items-center justify-between font-[family-name:var(--font-mono)] text-[13px] text-ink/40 transition group-hover:text-white/60">
                  <span>{card.index}</span>
                  <span className="text-[#10A37F] transition group-hover:text-white">{card.label}</span>
                </div>
                <h3 className="mt-12 max-w-[23rem] text-[29px] font-semibold leading-[1.08] text-ink transition group-hover:text-white">
                  {card.title}
                </h3>
                <p className="mt-5 max-w-[23rem] text-[16px] leading-7 text-ink/60 transition group-hover:text-white/70">
                  {card.body}
                </p>
                <code className="mt-7 inline-flex border border-ink/20 bg-transparent px-3 py-2 font-[family-name:var(--font-mono)] text-[13px] text-ink/80 transition group-hover:border-white/70 group-hover:bg-black group-hover:text-white">
                  {card.signal}
                </code>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Flow(): React.ReactNode {
  return (
    <section id="flow" className="scroll-mt-[132px] border-y border-ink/10 bg-panel py-20 text-ink sm:py-28">
      <div className={frame}>
        <div className="px-5 sm:px-6">
          <SectionIntro
            marker="02 / flow"
            title="Plan. Build. Review. Run."
            body="Every useful step saves tokens, reduces code, or makes a review verifiable. If checks disagree with prose, checks win."
          />
        </div>

        <div className="divide-y divide-ink/10 border-x border-y border-ink/10">
          {flowRows.map(([step, body], index) => (
            <div
              key={step}
              className="group grid min-h-[104px] gap-4 px-5 py-6 transition hover:bg-ink/[0.04] sm:grid-cols-[90px_240px_1fr_80px] sm:items-center sm:px-4"
            >
              <span className="font-[family-name:var(--font-mono)] text-[13px] text-[#10A37F]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="text-[34px] font-semibold leading-none text-ink transition group-hover:translate-x-2 sm:text-[44px]">
                {step}
              </h3>
              <p className="max-w-[620px] text-[17px] leading-7 text-ink/60">{body}</p>
              <span className="font-[family-name:var(--font-mono)] text-[24px] text-[#10A37F] transition group-hover:translate-x-2">
                →
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CommandWall(): React.ReactNode {
  return (
    <section id="commands" className="scroll-mt-[132px] bg-base py-20 sm:py-28">
      <div className={frame}>
        <div className="px-5 sm:px-6">
          <SectionIntro
            marker="03 / commands"
            title="Commands are the interface."
            body="A small command surface for the whole crew: plan, build, review, scan, remember, resume."
          />
        </div>

        <div className="border-x border-t border-ink/10">
          {commands.map(([command, description]) => (
            <a
              key={command}
              href={GITHUB_URL}
              className="group grid gap-3 border-b border-ink/10 px-5 py-6 transition hover:bg-ink/[0.03] sm:grid-cols-[280px_1fr_48px] sm:items-center sm:px-4"
            >
              <code className="font-[family-name:var(--font-mono)] text-[15px] text-ink">{command}</code>
              <span className="text-[18px] leading-7 text-ink/60">{description}</span>
              <span className="font-[family-name:var(--font-mono)] text-[24px] text-[#10A37F] transition group-hover:translate-x-2">
                →
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing(): React.ReactNode {
  return (
    <section id="pricing" className="scroll-mt-[132px] bg-base py-20 sm:py-28">
      <div className={frame}>
        <div className="border border-ink/10">
          <div className="flex flex-col gap-5 border-b border-ink/10 px-5 py-10 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className={eyebrow}>04 / pricing</p>
              <h2 className="mt-4 text-[38px] font-semibold leading-[1] text-ink sm:text-[50px]">
                Start local. Scale when needed.
              </h2>
            </div>
            <p className="max-w-[380px] text-[16px] leading-7 text-ink/55">
              BYOK by default. Hosted credit resale stays outside the CLI core.
            </p>
          </div>

          <div className="grid divide-y divide-ink/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {plans.map((plan) => {
              const tone = planTones[plan.tone]

              return (
                <article key={plan.name} className="flex flex-col p-5 sm:p-8">
                  <h3 className={`text-[26px] font-semibold leading-none ${tone.name}`}>{plan.name}</h3>
                  <p className="mt-4 text-[20px] font-semibold text-ink">
                    {plan.price} <span className="font-normal text-ink/45">· {plan.priceNote}</span>
                  </p>
                  <p className="mt-3 min-h-[56px] text-[16px] leading-7 text-ink/60">{plan.description}</p>

                  <a href={GITHUB_URL} className={`mt-5 w-full ${tone.button}`}>
                    {plan.action}
                    <span className="transition group-hover:translate-x-1">→</span>
                  </a>

                  <div className={`mt-6 h-[190px] overflow-hidden border border-ink/10 ${tone.tile}`}>
                    <Image
                      src={plan.image}
                      alt=""
                      width={520}
                      height={380}
                      className="h-full w-full object-cover object-top opacity-90 grayscale mix-blend-multiply"
                    />
                  </div>

                  <p className="mt-6 font-[family-name:var(--font-mono)] text-[12px] uppercase text-ink/45">
                    Includes:
                  </p>
                  <ul className="mt-4 grid gap-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3 text-[15px] leading-6 text-ink/80">
                        <CheckBadge />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function CheckBadge(): React.ReactNode {
  return (
    <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-ink text-(--bg-base)">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      >
        <path d="m5 12 4 4 10-9" />
      </svg>
    </span>
  )
}

function FAQ(): React.ReactNode {
  return (
    <section id="faq" className="scroll-mt-[132px] bg-base py-20 sm:py-28">
      <div className={frame}>
        <div className="border-t border-ink/10" />
        <div className="grid gap-10 border-x border-ink/10 px-5 py-20 sm:px-6 lg:grid-cols-[360px_1fr]">
          <div className="max-w-[360px]">
            <p className={eyebrow}>05 / FAQ</p>
            <h2 className="mt-5 text-[42px] font-semibold leading-[1] text-ink sm:text-[58px]">
              The practical questions.
            </h2>
            <p className="mt-6 text-[18px] leading-8 text-ink/60">Short answers for putting a crew near a real repo.</p>
          </div>

          <div className="border-t border-ink/10">
            {faqs.map((item, index) => (
              <details key={item.question} className="group border-b border-ink/10 py-6">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[22px] font-semibold leading-7 text-ink">
                  <span>{item.question}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[#10A37F] transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-5 max-w-[720px] text-[16px] leading-7 text-ink/60">{item.answer}</p>
                <p className="mt-4 font-[family-name:var(--font-mono)] text-[12px] text-[#10A37F]/70">
                  [{String(index + 1).padStart(2, '0')}]
                </p>
              </details>
            ))}
          </div>
        </div>
        <div className="border-b border-ink/10" />
      </div>
    </section>
  )
}

function CopyCommand({ command, className = '' }: { command: string; className?: string }): React.ReactNode {
  const [copied, setCopied] = useState(false)

  async function copyCommand(): Promise<void> {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copyCommand}
      className={`${className} flex h-11 items-center justify-between border px-4 text-left font-[family-name:var(--font-mono)] text-[13px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10A37F] ${
        copied
          ? 'border-solid border-[#10A37F] bg-[#10A37F]/10 text-ink'
          : 'border-dashed border-ink/25 bg-ink/[0.04] text-ink/85 hover:border-ink/45'
      }`}
      aria-label={copied ? 'Copied install command' : 'Copy install command'}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="text-[#10A37F]">{copied ? 'Copied' : '$'}</span>
        {!copied ? <span className="truncate text-current">{command}</span> : null}
      </span>
      <span className={copied ? 'text-[#10A37F]' : 'text-ink/40'}>{copied ? <CheckIcon /> : <CopyIcon />}</span>
    </button>
  )
}

function CopyIcon(): React.ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="10" height="10" rx="1.5" />
      <path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15" />
    </svg>
  )
}

function CheckIcon(): React.ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5 12 4 4 10-9" />
    </svg>
  )
}

function Footer(): React.ReactNode {
  return (
    <footer className="relative min-h-[520px] overflow-hidden border-t border-ink/10 bg-panel text-ink">
      <div className={`${shell} relative z-10 grid gap-14 py-16 lg:grid-cols-[360px_1fr]`}>
        <div className="max-w-[360px]">
          <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-[#10A37F]">
            Install
          </p>
          <CopyCommand command={INSTALL_COMMAND} className="mt-6 w-full" />
          <a
            href={GITHUB_URL}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-3 border border-[#10A37F] bg-[#10A37F] px-5 text-[15px] font-semibold text-black transition hover:bg-[#0e8c6d]"
          >
            Open GitHub <span>→</span>
          </a>
        </div>

        <div className="grid gap-10">
          <div className="grid gap-8 sm:grid-cols-4">
            <FooterColumn title="Product" links={['Spine', 'Commands', 'Pricing', 'Review']} />
            <FooterColumn title="CLI" links={['/plan', '/build', '/review', '/terse']} />
            <FooterColumn title="Proof" links={['Checks', 'Sessions', 'Memory', 'Receipts']} />
            <FooterColumn title="Project" links={['GitHub', 'Releases', 'Issues', 'Security']} />
          </div>

          <div className="flex flex-col gap-5 border-t border-ink/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[#10A37F]">
                Connect
              </p>
              <div className="mt-3 flex items-center gap-4">
                {socialLinks.map((social) => (
                  <SocialLink key={social.name} {...social} />
                ))}
              </div>
            </div>
            <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-ink/40">
              © {new Date().getFullYear()} Orchentra · All rights reserved
            </span>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute -bottom-[2.8vw] left-0 right-0 select-none text-center text-[18vw] font-semibold leading-none text-ink/[0.045]">
        Orchentra.
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: string[] }): React.ReactNode {
  return (
    <div>
      <h3 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[#10A37F]">
        {title}
      </h3>
      <ul className="group/list mt-5 grid gap-2.5">
        {links.map((link) => (
          <li key={link}>
            <a
              href={link === 'GitHub' ? GITHUB_URL : '#'}
              className="text-[14px] text-ink/70 transition group-hover/list:text-ink/25 hover:!text-ink"
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SocialLink({ name, label, href }: { name: SocialName; label: string; href: string }): React.ReactNode {
  return (
    <a
      href={href}
      aria-label={label}
      className="inline-flex size-5 items-center justify-center text-ink/85 transition hover:-translate-y-0.5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/60"
    >
      <SocialIcon name={name} />
    </a>
  )
}

function SocialIcon({ name }: { name: SocialName }): React.ReactNode {
  const className = 'size-5'

  if (name === 'x') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26L22.827 21.75h-6.657l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25h6.826l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
      </svg>
    )
  }

  if (name === 'github') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
        <path d="M12 .5a12 12 0 0 0-3.8 23.38c.6.1.82-.26.82-.58v-2.02c-3.34.72-4.04-1.42-4.04-1.42-.54-1.38-1.32-1.74-1.32-1.74-1.08-.74.08-.72.08-.72 1.2.08 1.84 1.24 1.84 1.24 1.06 1.82 2.78 1.3 3.46 1 .1-.78.42-1.3.76-1.6-2.66-.3-5.46-1.34-5.46-5.94 0-1.32.46-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.22A11.48 11.48 0 0 1 12 4.84c1.02.01 2.04.14 3 .4 2.3-1.54 3.3-1.22 3.3-1.22.66 1.66.24 2.88.12 3.18.78.84 1.24 1.9 1.24 3.22 0 4.62-2.8 5.64-5.48 5.94.44.38.82 1.12.82 2.26v3.36c0 .32.22.7.82.58A12 12 0 0 0 12 .5Z" />
      </svg>
    )
  }

  if (name === 'linkedin') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
        <path d="M4.98 3.5a2.48 2.48 0 1 1 0 4.96 2.48 2.48 0 0 1 0-4.96ZM3 9.4h3.96V21H3V9.4Zm6.25 0h3.8v1.58h.06c.52-.98 1.8-2.02 3.7-2.02 3.96 0 4.69 2.6 4.69 5.98V21h-3.96v-5.38c0-1.28-.02-2.94-1.8-2.94-1.8 0-2.07 1.4-2.07 2.86V21H9.25V9.4Z" />
      </svg>
    )
  }

  if (name === 'discord') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
        <path d="M20.32 4.37A18.8 18.8 0 0 0 15.66 3l-.22.44c1.64.4 2.4.98 2.4.98a15.1 15.1 0 0 0-11.34 0s.76-.58 2.4-.98L8.68 3c-1.64.3-3.2.76-4.66 1.37C1.08 8.72.28 12.96.68 17.14A18.9 18.9 0 0 0 6.38 20s.68-.82 1.24-1.52a8.14 8.14 0 0 1-1.96-.94l.48-.36a11.78 11.78 0 0 0 11.72 0l.48.36c-.62.4-1.28.72-1.98.94.56.7 1.24 1.52 1.24 1.52a18.8 18.8 0 0 0 5.72-2.86c.48-4.84-.8-9.04-3-12.77ZM8.58 14.56c-1.12 0-2.04-1.02-2.04-2.28 0-1.26.9-2.28 2.04-2.28 1.14 0 2.06 1.02 2.04 2.28 0 1.26-.9 2.28-2.04 2.28Zm6.84 0c-1.12 0-2.04-1.02-2.04-2.28 0-1.26.9-2.28 2.04-2.28 1.14 0 2.06 1.02 2.04 2.28 0 1.26-.9 2.28-2.04 2.28Z" />
      </svg>
    )
  }

  if (name === 'reddit') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
        <path d="M24 11.78a2.8 2.8 0 0 0-4.74-2.02c-1.75-1.15-4.1-1.9-6.7-2.02l1.14-5.36 3.72.8a2.04 2.04 0 1 0 .22-1.02l-4.3-.92a.54.54 0 0 0-.64.42l-1.3 6.08c-2.64.1-5.04.84-6.82 2A2.8 2.8 0 1 0 1.5 14.2a4.82 4.82 0 0 0-.08.84c0 4.04 4.74 7.3 10.58 7.3s10.58-3.26 10.58-7.3c0-.28-.02-.56-.08-.84A2.8 2.8 0 0 0 24 11.78ZM7.5 13.7a1.54 1.54 0 1 1 3.08 0 1.54 1.54 0 0 1-3.08 0Zm8.2 4.66c-1.06 1.06-3.08 1.14-3.7 1.14-.62 0-2.64-.08-3.7-1.14a.54.54 0 0 1 .76-.76c.66.66 2.08.82 2.94.82s2.28-.16 2.94-.82a.54.54 0 1 1 .76.76Zm-.24-3.12a1.54 1.54 0 1 1 0-3.08 1.54 1.54 0 0 1 0 3.08Z" />
      </svg>
    )
  }

  return null
}

function SectionIntro({ marker, title, body }: { marker: string; title: string; body: string }): React.ReactNode {
  return (
    <div className="mb-12 grid gap-6 md:grid-cols-2 md:items-end">
      <div className="max-w-[560px]">
        <p className={eyebrow}>{marker}</p>
        <h2 className="mt-5 text-[42px] font-semibold leading-[1] text-ink sm:text-[58px]">{title}</h2>
      </div>
      <p className="max-w-[560px] text-[18px] leading-8 text-ink/60">{body}</p>
    </div>
  )
}

function EdgeOverlay({ headImage }: { headImage?: string }): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
    >
      <span className="absolute inset-0 bg-black" />
      {headImage ? (
        <span className="absolute inset-0 z-0 overflow-hidden opacity-[0.55] mix-blend-screen invert">
          <Image src={headImage} alt="" fill className="object-cover object-center" />
        </span>
      ) : (
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.22)_1px,transparent_0)] bg-[length:8px_8px] opacity-70" />
      )}
      <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.14),transparent_18%,transparent_82%,rgba(255,255,255,0.14)),linear-gradient(0deg,rgba(255,255,255,0.14),transparent_22%,transparent_78%,rgba(255,255,255,0.14))] opacity-60" />
      <span className="absolute left-4 top-4 size-7 border-l border-t border-white/70" />
      <span className="absolute right-4 top-4 size-7 border-r border-t border-white/70" />
      <span className="absolute bottom-4 left-4 size-7 border-b border-l border-white/70" />
      <span className="absolute bottom-4 right-4 size-7 border-b border-r border-white/70" />
    </span>
  )
}

function useActiveSection(ids: readonly string[]): string {
  const [activeId, setActiveId] = useState(ids[0] ?? '')

  useEffect(() => {
    let frame = 0

    const updateActiveSection = (): void => {
      const nextActive = ids.reduce((current, id) => {
        const element = document.getElementById(id)
        if (!element) return current

        const top = element.getBoundingClientRect().top
        return top <= 260 ? id : current
      }, ids[0] ?? '')

      setActiveId(nextActive)
    }

    const onScroll = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateActiveSection)
    }

    updateActiveSection()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ids])

  return activeId
}

'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const GITHUB_URL = 'https://github.com/Athrean/Orchentra'

const shell = 'mx-auto w-full max-w-[1180px] px-5 sm:px-6'
const eyebrow = 'font-[family-name:var(--font-mono)] text-[12px] uppercase leading-[1.35] text-[#004700]'
const buttonBase =
  'group inline-flex h-11 items-center justify-center gap-3 border px-5 text-[15px] font-semibold transition duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008000] focus-visible:ring-offset-2'
const lightButton = `${buttonBase} border-[#001A00]/20 bg-white text-[#001A00] hover:border-[#004700] hover:text-[#004700]`
const greenButton = `${buttonBase} border-[#004700] bg-[#004700] text-white hover:bg-[#008000]`

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
  },
  {
    index: '02',
    label: 'budget',
    title: 'Keeps context under control.',
    body: 'Tool output caps and compaction receipts keep long sessions useful without flooding the model.',
    signal: '/status',
  },
  {
    index: '03',
    label: 'lean',
    title: 'Writes less, better code.',
    body: 'YAGNI, stdlib, native, existing dependency, one line, then custom code. In that order.',
    signal: '/review',
  },
  {
    index: '04',
    label: 'plan',
    title: 'Plans before files move.',
    body: 'Best route, named alternatives, scaffold, and checks before implementation starts.',
    signal: '/plan <need>',
  },
  {
    index: '05',
    label: 'build',
    title: 'Builds in vertical slices.',
    body: 'Small repo-aware diffs, project conventions, checks after each slice.',
    signal: '/build <need>',
  },
  {
    index: '06',
    label: 'review',
    title: 'Proves its review.',
    body: 'Findings are proposals. Tests, typechecks, builds, and repros decide what is real.',
    signal: '/review',
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

const plans = [
  {
    name: 'Install',
    price: 'BYOK',
    description: 'Put the crew in your terminal.',
    action: 'Open GitHub',
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
    description: 'Keep work in git and sessions on disk.',
    action: 'Read the README',
    featured: true,
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
    description: 'Hosted credit resale stays outside the CLI core.',
    action: 'Track releases',
    features: [
      'BYOK remains the default',
      'Provider routing can stay private',
      'Policy travels with repos',
      'No telemetry by default',
    ],
  },
]

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
    <main className="min-h-screen bg-white text-[#001A00]">
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

function Nav(): React.ReactNode {
  return (
    <header className="sticky top-0 z-50 border-b border-[#001A00]/10 bg-white/90 backdrop-blur">
      <nav className={`${shell} flex h-[72px] items-center justify-between gap-5`} aria-label="Main navigation">
        <a href="#" aria-label="Orchentra home" className="flex items-center gap-3 text-[18px] font-semibold">
          <span className="flex size-9 items-center justify-center border border-[#008000]/30 bg-white p-1.5">
            <Image src="/green-logo.svg" alt="" width={28} height={28} priority />
          </span>
          <span>Orchentra</span>
        </a>

        <div className="hidden items-center gap-8 text-[15px] text-[#001A00]/70 md:flex">
          <a className="transition hover:text-[#004700]" href="#runtime">
            Runtime
          </a>
          <a className="transition hover:text-[#004700]" href="#commands">
            Commands
          </a>
          <a className="transition hover:text-[#004700]" href="#pricing">
            Pricing
          </a>
          <a className="transition hover:text-[#004700]" href="#faq">
            FAQ
          </a>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={GITHUB_URL}
            className="hidden sm:inline-flex sm:h-11 sm:items-center sm:border sm:border-[#001A00]/20 sm:bg-white sm:px-5 sm:text-[15px] sm:font-semibold sm:text-[#001A00] sm:transition sm:hover:border-[#004700] sm:hover:text-[#004700]"
          >
            GitHub
          </a>
          <a href={GITHUB_URL} className={greenButton}>
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
    <section className="overflow-hidden border-b border-[#001A00]/10 bg-white">
      <div className={`${shell} flex min-h-[650px] flex-col items-center justify-center py-16 text-center md:py-20`}>
        <a
          href="#runtime"
          className="group inline-flex items-center border border-[#008000]/30 bg-white text-[13px] text-[#001A00]"
        >
          <span className="border-r border-[#008000]/30 px-3 py-2 font-[family-name:var(--font-mono)] text-[#008000]">
            New
          </span>
          <span className="px-3 py-2">CLI-first coding crew</span>
          <span className="border-l border-[#008000]/30 px-3 py-2 transition group-hover:translate-x-1">→</span>
        </a>

        <h1 className="mt-10 max-w-[1120px] text-[52px] font-semibold leading-[0.96] tracking-[-0.01em] text-[#001A00] sm:text-[78px] lg:text-[96px]">
          Spends less. Writes less. Proves its work.
        </h1>

        <p className="mt-8 max-w-[720px] text-[18px] leading-8 text-[#001A00]/68">
          A coding crew in your terminal: fewer tokens, leaner diffs, review that runs the checks. Bring your own
          provider key.
        </p>

        <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <a href={GITHUB_URL} className={greenButton}>
            Install the CLI
            <span className="transition group-hover:translate-x-1">→</span>
          </a>
          <a href="#pricing" className={lightButton}>
            View pricing
          </a>
        </div>

        <code className="mt-3 flex w-full max-w-[430px] items-center justify-between border border-dashed border-[#001A00]/25 bg-white px-4 py-3 text-left font-[family-name:var(--font-mono)] text-[13px] text-[#001A00]/72">
          <span>
            <span className="text-[#008000]">$</span> npm install -g @orchentra/cli
          </span>
          <span className="text-[#004700]">copy</span>
        </code>
      </div>
    </section>
  )
}

function WorkLoopBanner(): React.ReactNode {
  return (
    <section className="bg-[#001A00] text-white">
      <div className={`${shell} grid border-l border-white/10 sm:grid-cols-5`}>
        {workSteps.map((step, index) => (
          <div key={step.title} className="min-h-[150px] border-b border-r border-white/10 p-5 sm:border-b-0">
            <div className="flex items-center justify-between font-[family-name:var(--font-mono)] text-[12px] uppercase">
              <span className="text-[#008000]">{step.title}</span>
              <span className="text-white/25">{String(index + 1).padStart(2, '0')}</span>
            </div>
            <p className="mt-5 text-[14px] leading-6 text-white/64">{step.body}</p>
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
    <section className="sticky top-[72px] z-40 border-y border-[#008000]/20 bg-white/95 backdrop-blur">
      <div className={shell}>
        <div className="border-x border-[#008000]/20">
          <div className="flex h-11 items-center justify-between gap-2 px-4 font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.1em] sm:gap-4 sm:px-6 sm:tracking-[0.16em]">
            <a href={`#${activeSection.id}`} className="flex min-w-0 items-center gap-3 text-[#001A00]/50">
              <span className="text-[#008000]">›</span>
              <span className="truncate">{activeSection.label}</span>
            </a>
            <span className="shrink-0 text-[#004700]">
              [{activeIndex + 1}/{sectionRailItems.length}]
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function Runtime(): React.ReactNode {
  return (
    <section id="runtime" className="scroll-mt-[132px] bg-white py-20 sm:py-28">
      <div className={shell}>
        <SectionIntro
          marker="01 / runtime"
          title="The spine is the product."
          body="Every agent carries the same spine: terse output, budgeted context, lean code, and verification by running."
        />

        <div className="grid border-l border-t border-[#001A00]/10 md:grid-cols-2 lg:grid-cols-3">
          {runtimeCards.map((card) => (
            <article
              key={card.index}
              className="group relative min-h-[320px] overflow-hidden border-b border-r border-[#001A00]/10 bg-white p-6 transition duration-200 hover:-translate-y-1 hover:border-[#001A00]"
            >
              <EdgeOverlay />
              <div className="relative z-10">
                <div className="flex items-center justify-between font-[family-name:var(--font-mono)] text-[13px] text-[#001A00]/50 transition group-hover:text-white/62">
                  <span>{card.index}</span>
                  <span className="text-[#004700] transition group-hover:text-[#008000]">{card.label}</span>
                </div>
                <h3 className="mt-12 max-w-[23rem] text-[29px] font-semibold leading-[1.08] text-[#001A00] transition group-hover:text-white">
                  {card.title}
                </h3>
                <p className="mt-5 max-w-[23rem] text-[16px] leading-7 text-[#001A00]/64 transition group-hover:text-white/66">
                  {card.body}
                </p>
                <code className="mt-7 inline-flex border border-[#008000]/25 bg-white px-3 py-2 font-[family-name:var(--font-mono)] text-[13px] text-[#004700] transition group-hover:border-[#008000] group-hover:bg-[#001A00] group-hover:text-white">
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
    <section id="flow" className="scroll-mt-[132px] bg-[#001A00] py-20 text-white sm:py-28">
      <div className={shell}>
        <SectionIntro
          marker="02 / flow"
          title="Plan. Build. Review. Run."
          body="Every useful step saves tokens, reduces code, or makes a review verifiable. If checks disagree with prose, checks win."
          dark
        />

        <div className="divide-y divide-white/12 border-y border-white/12">
          {flowRows.map(([step, body], index) => (
            <div
              key={step}
              className="group grid min-h-[104px] gap-4 py-6 transition hover:bg-white/[0.04] sm:grid-cols-[90px_240px_1fr_80px] sm:items-center sm:px-4"
            >
              <span className="font-[family-name:var(--font-mono)] text-[13px] text-[#008000]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="text-[34px] font-semibold leading-none text-white transition group-hover:translate-x-2 sm:text-[44px]">
                {step}
              </h3>
              <p className="max-w-[620px] text-[17px] leading-7 text-white/68">{body}</p>
              <span className="font-[family-name:var(--font-mono)] text-[24px] text-[#008000] transition group-hover:translate-x-2">
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
    <section id="commands" className="scroll-mt-[132px] bg-white py-20 sm:py-28">
      <div className={shell}>
        <SectionIntro
          marker="03 / commands"
          title="Commands are the interface."
          body="A small command surface for the whole crew: plan, build, review, scan, remember, resume."
        />

        <div className="border-t border-[#001A00]/14">
          {commands.map(([command, description]) => (
            <a
              key={command}
              href={GITHUB_URL}
              className="group grid gap-3 border-b border-[#001A00]/14 py-6 transition hover:bg-[#008000]/[0.035] sm:grid-cols-[280px_1fr_48px] sm:items-center sm:px-4"
            >
              <code className="font-[family-name:var(--font-mono)] text-[15px] text-[#001A00]">{command}</code>
              <span className="text-[18px] leading-7 text-[#001A00]/65">{description}</span>
              <span className="font-[family-name:var(--font-mono)] text-[24px] text-[#008000] transition group-hover:translate-x-2">
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
    <section id="pricing" className="scroll-mt-[132px] border-y border-[#001A00]/10 bg-white py-20 sm:py-28">
      <div className={shell}>
        <SectionIntro
          marker="04 / pricing"
          title="Start local. Scale when needed."
          body="BYOK by default. Hosted credit resale stays outside the CLI core."
        />

        <div className="grid border-l border-t border-[#001A00]/10 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`group relative flex min-h-[500px] flex-col border-b border-r border-[#001A00]/10 p-6 ${
                plan.featured ? 'bg-[#001A00] text-white' : 'bg-white text-[#001A00] transition hover:border-[#001A00]'
              }`}
            >
              {!plan.featured ? <EdgeOverlay /> : null}
              <div className="relative z-10 flex h-full flex-col">
                <p
                  className={`font-[family-name:var(--font-mono)] text-[12px] uppercase transition ${
                    plan.featured ? 'text-[#008000]' : 'text-[#004700] group-hover:text-[#008000]'
                  }`}
                >
                  {plan.name}
                </p>
                <h3 className="mt-5 text-[42px] font-semibold leading-none transition group-hover:text-white">
                  {plan.price}
                </h3>
                <p
                  className={`mt-5 text-[16px] leading-7 transition ${plan.featured ? 'text-white/68' : 'text-[#001A00]/64 group-hover:text-white/66'}`}
                >
                  {plan.description}
                </p>

                <ul className="mt-8 grid gap-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-[15px] leading-6">
                      <span className={plan.featured ? 'text-[#008000]' : 'text-[#004700] group-hover:text-[#008000]'}>
                        ▪
                      </span>
                      <span
                        className={`transition ${plan.featured ? 'text-white/82' : 'text-[#001A00]/72 group-hover:text-white/72'}`}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href={GITHUB_URL}
                  className={`mt-auto ${plan.featured ? `${buttonBase} border-white bg-white text-[#001A00] hover:bg-white/90` : greenButton}`}
                >
                  {plan.action}
                  <span className="transition group-hover:translate-x-1">→</span>
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQ(): React.ReactNode {
  return (
    <section id="faq" className="scroll-mt-[132px] bg-white py-20 sm:py-28">
      <div className={`${shell} grid gap-10 lg:grid-cols-[360px_1fr]`}>
        <div className="max-w-[360px]">
          <p className={eyebrow}>05 / FAQ</p>
          <h2 className="mt-5 text-[42px] font-semibold leading-[1] text-[#001A00] sm:text-[58px]">
            The practical questions.
          </h2>
          <p className="mt-6 text-[18px] leading-8 text-[#001A00]/64">
            Short answers for putting a crew near a real repo.
          </p>
        </div>

        <div className="border-t border-[#001A00]/14">
          {faqs.map((item, index) => (
            <details key={item.question} className="group border-b border-[#001A00]/14 py-6">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[22px] font-semibold leading-7 text-[#001A00]">
                <span>{item.question}</span>
                <span className="font-[family-name:var(--font-mono)] text-[#008000] transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-5 max-w-[720px] text-[16px] leading-7 text-[#001A00]/64">{item.answer}</p>
              <p className="mt-4 font-[family-name:var(--font-mono)] text-[12px] text-[#004700]">
                [{String(index + 1).padStart(2, '0')}]
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer(): React.ReactNode {
  return (
    <footer className="relative min-h-[520px] overflow-hidden bg-[#001A00] text-white">
      <div className={`${shell} relative z-10 grid gap-14 py-16 lg:grid-cols-[360px_1fr]`}>
        <div className="max-w-[360px]">
          <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-[#008000]">
            Install
          </p>
          <code className="mt-6 block border border-white/20 bg-white/[0.04] px-4 py-3 font-[family-name:var(--font-mono)] text-[13px] text-white">
            $ npm install -g @orchentra/cli
          </code>
          <a
            href={GITHUB_URL}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-3 border border-white bg-white px-5 text-[15px] font-semibold text-[#001A00] transition hover:bg-white/90"
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

          <div className="flex flex-col gap-5 border-t border-white/12 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[#008000]">
                Connect
              </p>
              <div className="mt-3 flex items-center gap-4">
                {socialLinks.map((social) => (
                  <SocialLink key={social.name} {...social} />
                ))}
              </div>
            </div>
            <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-white/42">
              © {new Date().getFullYear()} Orchentra · All rights reserved
            </span>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute -bottom-[2.8vw] left-0 right-0 select-none text-center text-[18vw] font-semibold leading-none text-white/[0.045]">
        Orchentra.
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: string[] }): React.ReactNode {
  return (
    <div>
      <h3 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[#008000]">
        {title}
      </h3>
      <ul className="group/list mt-5 grid gap-2.5">
        {links.map((link) => (
          <li key={link}>
            <a
              href={link === 'GitHub' ? GITHUB_URL : '#'}
              className="text-[14px] text-white/76 transition group-hover/list:text-white/28 hover:!text-white"
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
      className="inline-flex size-5 items-center justify-center text-white/88 transition hover:-translate-y-0.5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
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

function SectionIntro({
  marker,
  title,
  body,
  dark = false,
}: {
  marker: string
  title: string
  body: string
  dark?: boolean
}): React.ReactNode {
  return (
    <div className="mb-12 grid gap-6 md:grid-cols-2 md:items-end">
      <div className="max-w-[560px]">
        <p className={dark ? 'font-[family-name:var(--font-mono)] text-[12px] uppercase text-[#008000]' : eyebrow}>
          {marker}
        </p>
        <h2
          className={`mt-5 text-[42px] font-semibold leading-[1] sm:text-[58px] ${dark ? 'text-white' : 'text-[#001A00]'}`}
        >
          {title}
        </h2>
      </div>
      <p className={`max-w-[560px] text-[18px] leading-8 ${dark ? 'text-white/68' : 'text-[#001A00]/64'}`}>{body}</p>
    </div>
  )
}

function EdgeOverlay(): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-0 transition duration-200 group-hover:opacity-100"
    >
      <span className="absolute inset-0 bg-[#001A00]" />
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,128,0,0.36)_1px,transparent_0)] bg-[length:8px_8px] opacity-70" />
      <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,71,0,0.7),transparent_18%,transparent_82%,rgba(0,71,0,0.7)),linear-gradient(0deg,rgba(0,71,0,0.7),transparent_22%,transparent_78%,rgba(0,71,0,0.7))] opacity-50" />
      <span className="absolute left-4 top-4 size-7 border-l border-t border-[#008000]" />
      <span className="absolute right-4 top-4 size-7 border-r border-t border-[#008000]" />
      <span className="absolute bottom-4 left-4 size-7 border-b border-l border-[#008000]" />
      <span className="absolute bottom-4 right-4 size-7 border-b border-r border-[#008000]" />
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

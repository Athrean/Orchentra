'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const GITHUB_URL = 'https://github.com/Athrean/Orchentra'

const shell = 'mx-auto w-full max-w-[1180px] px-5 sm:px-6'
const railShell = 'mx-auto w-full max-w-[1180px]'
const eyebrow = 'font-[family-name:var(--font-mono)] text-[12px] uppercase leading-[1.35] text-[#004700]'
const buttonBase =
  'group inline-flex h-11 items-center justify-center gap-3 border px-5 text-[15px] font-semibold transition duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008000] focus-visible:ring-offset-2'
const lightButton = `${buttonBase} border-[#001A00]/20 bg-white text-[#001A00] hover:border-[#004700] hover:text-[#004700]`
const greenButton = `${buttonBase} border-[#004700] bg-[#004700] text-white hover:bg-[#008000]`

const sectionRailItems = [
  { id: 'runtime', label: 'Product catalog' },
  { id: 'flow', label: 'How it works' },
  { id: 'commands', label: 'Command surface' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
] as const

const sectionIds = sectionRailItems.map((section) => section.id)

const workSteps = [
  {
    title: 'Read',
    body: 'Map files, scripts, dirty state, and product language.',
  },
  {
    title: 'Plan',
    body: 'Pick the smallest credible path and name the checks.',
  },
  {
    title: 'Patch',
    body: 'Edit the real files with the repo’s conventions.',
  },
  {
    title: 'Verify',
    body: 'Run the closest meaningful gate and report the result.',
  },
  {
    title: 'Explain',
    body: 'Return outcome, risk, and what changed without performance.',
  },
]

const runtimeCards = [
  {
    index: '01',
    label: 'Plan',
    title: 'Turns a rough ask into a working route.',
    body: 'Orchentra reads the repo first, names the options, and keeps the implementation path narrow enough to finish.',
    signal: '/plan <need>',
  },
  {
    index: '02',
    label: 'Build',
    title: 'Moves in small diffs with local taste.',
    body: 'It follows the project’s patterns, prefers existing helpers, and keeps unrelated churn out of the change.',
    signal: '/build <slice>',
  },
  {
    index: '03',
    label: 'Review',
    title: 'Findings lead. Evidence decides.',
    body: 'Reviews start with concrete risks, then tie the verdict to typechecks, tests, and the commands that ran.',
    signal: '/review --diff',
  },
  {
    index: '04',
    label: 'Budget',
    title: 'Token spend stays visible while work happens.',
    body: 'Terse modes, compaction, and usage totals keep the runtime efficient without hiding important context.',
    signal: '/terse max',
  },
  {
    index: '05',
    label: 'Graph',
    title: 'Every run has a reason trail.',
    body: 'Execution graphs and why views make decisions inspectable after the terminal scroll has moved on.',
    signal: 'orchentra graph',
  },
  {
    index: '06',
    label: 'Hooks',
    title: 'Project policy travels with the workspace.',
    body: 'Local hooks, permissions, and skills make the agent behave like part of the repo, not a generic chat pane.',
    signal: '.orchentra/',
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
  ['/plan <need>', 'Architecture, alternatives, phases, and acceptance checks.'],
  ['/review', 'Findings-first code review with verification attached.'],
  ['/scan', 'A lighter pass over a tree, file, or diff.'],
  ['/terse <mode>', 'Control response density and track spend.'],
  ['session import', 'Bring Claude or Codex histories into Orchentra sessions.'],
]

const plans = [
  {
    name: 'Local',
    price: 'Open source',
    description: 'For individual developers who want the runtime in their terminal today.',
    action: 'Start on GitHub',
    features: ['CLI runtime', 'Bring your own provider keys', 'Repo-local skills and hooks', 'Session import'],
  },
  {
    name: 'Team',
    price: 'Usage based',
    description: 'For teams standardizing review, policy, and proof across repositories.',
    action: 'Talk to us',
    featured: true,
    features: [
      'Shared workspace policy',
      'Execution graph history',
      'Review and verification gates',
      'Team usage visibility',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For organizations with private deployment, compliance, and support needs.',
    action: 'Contact sales',
    features: ['Private runtime options', 'Custom auth and provider routing', 'Audit-ready traces', 'Priority support'],
  },
]

const faqs = [
  {
    question: 'Is Orchentra a model provider?',
    answer:
      'No. Orchentra is the terminal runtime around your agents. You bring the model key or provider route; Orchentra handles planning, execution discipline, review, and proof.',
  },
  {
    question: 'How is it different from a normal coding chat?',
    answer:
      'It works from the repository outward: reads files, follows local patterns, runs commands, respects workspace policy, and reports the checks that prove or limit the result.',
  },
  {
    question: 'Can teams enforce local rules?',
    answer:
      'Yes. Repo-local hooks, permissions, and skills let projects encode behavior that should travel with the workspace instead of relying on memory or taste.',
  },
  {
    question: 'What happens when a check fails?',
    answer:
      'The failure is reported as the source of truth. Orchentra distinguishes proposed review findings from evidence produced by typechecks, tests, builds, or other gates.',
  },
  {
    question: 'Does it store private code?',
    answer:
      'The CLI is designed for local-first work. Team or enterprise setups should be configured around your provider, retention, and deployment requirements.',
  },
]

type SocialName = 'x' | 'github' | 'linkedin' | 'discord'

const socialLinks: Array<{ name: SocialName; label: string; href: string }> = [
  { name: 'x', label: 'X', href: '#' },
  { name: 'github', label: 'GitHub', href: GITHUB_URL },
  { name: 'linkedin', label: 'LinkedIn', href: '#' },
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
          <span className="px-3 py-2">Proof-first terminal runtime</span>
          <span className="border-l border-[#008000]/30 px-3 py-2 transition group-hover:translate-x-1">→</span>
        </a>

        <h1 className="mt-10 max-w-[1120px] text-[52px] font-semibold leading-[0.96] tracking-[-0.01em] text-[#001A00] sm:text-[78px] lg:text-[96px]">
          The terminal cloud for coding agents that prove their work.
        </h1>

        <p className="mt-8 max-w-[720px] text-[18px] leading-8 text-[#001A00]/68">
          Orchentra gives your agents repo context, scoped execution, review discipline, and verifiable checks in one
          CLI-first surface. Bring your own model, keep the work inspectable.
        </p>

        <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <a href={GITHUB_URL} className={greenButton}>
            Start building
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
      <div className={`${railShell} border-x border-[#008000]/20`}>
        <div className="flex h-11 items-center justify-between gap-4 px-6 font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.16em]">
          <a href={`#${activeSection.id}`} className="flex min-w-0 items-center gap-3 text-[#001A00]/50">
            <span className="text-[#008000]">›</span>
            <span className="truncate">{activeSection.label}</span>
          </a>
          <span className="shrink-0 text-[#004700]">
            [{activeIndex + 1}/{sectionRailItems.length}]
          </span>
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
          title="Six primitives. One sharp green surface."
          body="The section rail above updates as the page moves, keeping the current product chapter attached to the viewport."
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
          title="Horizontal work, then a verdict."
          body="Read, plan, patch, verify, explain. The page mirrors that rhythm with rows that react under the cursor."
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
          body="No brand rail, no ornamental cards. The page gives the product surface room to breathe."
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
          title="Start local. Scale when the team needs policy."
          body="Pricing is framed around how much coordination the runtime needs to carry for you."
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
            Short answers for the things teams ask before putting an agent runtime near production code.
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
            Command
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
            <FooterColumn title="Product" links={['Runtime', 'Commands', 'Pricing', 'Graph']} />
            <FooterColumn title="Resources" links={['Docs', 'Examples', 'Changelog', 'GitHub']} />
            <FooterColumn title="Company" links={['About', 'Security', 'Privacy', 'Terms']} />
            <FooterColumn title="Connect" links={['Contact', 'Discord', 'X / Twitter', 'LinkedIn']} />
          </div>

          <div className="flex flex-col gap-5 border-t border-white/12 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {socialLinks.map((social) => (
                <SocialLink key={social.name} {...social} />
              ))}
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
      className="flex size-8 items-center justify-center border border-white/16 text-white/68 transition hover:border-white/40 hover:text-white"
    >
      <SocialIcon name={name} />
    </a>
  )
}

function SocialIcon({ name }: { name: SocialName }): React.ReactNode {
  const className = 'size-4'

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

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4l16 16M20 4L4 20" />
    </svg>
  )
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

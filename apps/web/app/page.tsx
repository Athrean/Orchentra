import Image from 'next/image'

const GITHUB_URL = 'https://github.com/Athrean/Orchentra'

export default function Page(): React.ReactNode {
  return (
    <main className="min-h-screen">
      <Nav />
      <Hero />
      <Providers />
      <Pillars />
      <Console />
      <Commands />
      <CtaBand />
      <Footer />
    </main>
  )
}

function Wordmark({ size = 24 }: { size?: number }): React.ReactNode {
  return (
    <span className="inline-flex items-center gap-2">
      <Image src="/mascot.svg" alt="" width={size} height={size} priority />
      <span className="text-[17px] tracking-tight">Orchentra</span>
    </span>
  )
}

function Nav(): React.ReactNode {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--color-hairline)] bg-[var(--color-canvas)]/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-6">
        <Wordmark />
        <div className="hidden items-center gap-8 text-[15px] text-[var(--color-muted)] md:flex">
          <a href="#pillars" className="hover:text-[var(--color-ink)]">
            Why
          </a>
          <a href="#commands" className="hover:text-[var(--color-ink)]">
            Commands
          </a>
          <a href={GITHUB_URL} className="hover:text-[var(--color-ink)]">
            GitHub
          </a>
        </div>
        <a href={GITHUB_URL} className="btn-primary">
          Get started
        </a>
      </nav>
    </header>
  )
}

function Hero(): React.ReactNode {
  return (
    <section className="mx-auto max-w-[1100px] px-6 pt-24 pb-20 md:pt-32">
      <p className="mono-label mb-6">CLI-first coding crew</p>
      <h1 className="max-w-[14ch] text-[clamp(2.75rem,7vw,5.5rem)] font-normal">
        Spends less. Writes less. Proves its work.
      </h1>
      <p className="mt-8 max-w-[52ch] text-[18px] leading-[1.5] text-[var(--color-muted)]">
        A coding crew that runs in your terminal — fewer tokens, less but better code, and a review that proves itself
        by running your tests. Bring your own provider key.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-6">
        <a href={GITHUB_URL} className="btn-primary">
          Get started
        </a>
        <a href="#commands" className="btn-link">
          See the commands
        </a>
      </div>
      <div className="mt-10 inline-flex items-center gap-3 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-stone)] px-4 py-3 font-[family-name:var(--font-mono)] text-[14px]">
        <span className="text-[var(--color-accent)]">$</span>
        <span>npm install -g orchentra</span>
      </div>
    </section>
  )
}

function Providers(): React.ReactNode {
  return (
    <section className="border-y border-[var(--color-hairline)]">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 px-6 py-10 text-center">
        <p className="mono-label">Bring your own key</p>
        <p className="text-[15px] text-[var(--color-muted)]">
          Anthropic &nbsp;·&nbsp; OpenAI &nbsp;·&nbsp; Google &nbsp;·&nbsp; OpenRouter
        </p>
      </div>
    </section>
  )
}

const PILLARS = [
  {
    label: 'fewer tokens',
    title: 'Spends fewer tokens',
    body: 'Terse output and live context budgeting cut what goes over the wire — without ever shortening code, commands, or safety text. Savings are inspectable per session.',
  },
  {
    label: 'less code',
    title: 'Writes less, better code',
    body: 'A lean-code discipline that climbs from YAGNI to stdlib to one line before it writes anything custom. The shortest working diff wins.',
  },
  {
    label: 'review that runs',
    title: 'Proves its review by running',
    body: 'Findings are an untrusted proposal. The reviewer then runs your typecheck and tests — the trusted checker — and tells you which findings a real failing gate corroborates.',
  },
]

function Pillars(): React.ReactNode {
  return (
    <section id="pillars" className="mx-auto max-w-[1100px] px-6 py-24">
      <h2 className="max-w-[20ch] text-[clamp(2rem,4vw,3rem)] font-normal">Three skills, on every agent.</h2>
      <div className="mt-14 grid gap-12 md:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="border-t border-[var(--color-ink)] pt-6">
            <p className="mono-label mb-4">{p.label}</p>
            <h3 className="text-[22px] leading-[1.3]">{p.title}</h3>
            <p className="mt-3 text-[16px] leading-[1.5] text-[var(--color-muted)]">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Console(): React.ReactNode {
  return (
    <section className="mx-auto max-w-[1100px] px-6 pb-24">
      <div className="overflow-hidden rounded-[22px] bg-[var(--color-ink-near)] p-6 font-[family-name:var(--font-mono)] text-[13.5px] leading-[1.7] text-white/90 md:p-10">
        <div className="mb-5 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <span className="h-3 w-3 rounded-full bg-white/15" />
        </div>
        <pre className="whitespace-pre-wrap">
          <span className="text-[var(--color-accent)]">›</span> /review --diff
          {'\n\n'}
          <span className="text-white/55">Findings (proposed — verify against the checks below):</span>
          {'\n'} [P1] api/auth.ts:42 — token expiry uses {'<'} not {'<='}
          {'\n\n'}
          <span className="text-white/55">Verified by running:</span>
          {'\n'} [ok] typecheck — bun run typecheck (exit 0)
          {'\n'} <span className="text-[#ff8a6a]">[FAIL]</span> test — bun run test (exit 1)
          {'\n\n'}
          <span className="text-[var(--color-accent)]">Verdict:</span> 1 check failing — findings corroborated by a real
          failing gate.
        </pre>
      </div>
    </section>
  )
}

const COMMANDS = [
  { cmd: '/plan <need>', desc: 'Architect a need into a stack, named alternatives, and a scaffold.' },
  { cmd: '/review', desc: 'Propose findings, then verify by running your typecheck and tests.' },
  { cmd: '/scan', desc: 'A lighter LLM pass over a diff, the tree, or a single file.' },
  { cmd: '/terse <mode>', desc: 'Dial output compactness; watch the per-mode token tally.' },
]

function Commands(): React.ReactNode {
  return (
    <section id="commands" className="border-t border-[var(--color-hairline)]">
      <div className="mx-auto max-w-[1100px] px-6 py-24">
        <h2 className="max-w-[20ch] text-[clamp(2rem,4vw,3rem)] font-normal">A small, sharp command surface.</h2>
        <div className="mt-12 divide-y divide-[var(--color-hairline)] border-t border-[var(--color-hairline)]">
          {COMMANDS.map((c) => (
            <div key={c.cmd} className="flex flex-col gap-1 py-6 md:flex-row md:items-baseline md:gap-10">
              <code className="w-[14rem] shrink-0 font-[family-name:var(--font-mono)] text-[15px] text-[var(--color-ink)]">
                {c.cmd}
              </code>
              <span className="text-[16px] text-[var(--color-muted)]">{c.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CtaBand(): React.ReactNode {
  return (
    <section className="bg-[var(--color-ink-near)]">
      <div className="mx-auto flex max-w-[1100px] flex-col items-start gap-8 px-6 py-24 text-white">
        <h2 className="max-w-[18ch] text-[clamp(2rem,4.5vw,3.5rem)] font-normal">Put the crew in your terminal.</h2>
        <div className="inline-flex items-center gap-3 rounded-lg border border-white/15 px-4 py-3 font-[family-name:var(--font-mono)] text-[14px] text-white/90">
          <span className="text-[var(--color-accent)]">$</span>
          <span>npm install -g orchentra</span>
        </div>
        <a href={GITHUB_URL} className="rounded-[32px] bg-white px-6 py-3 text-[15px] text-[var(--color-ink-near)]">
          Get started on GitHub
        </a>
      </div>
    </section>
  )
}

function Footer(): React.ReactNode {
  return (
    <footer className="border-t border-[var(--color-hairline)]">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-between gap-4 px-6 py-10 text-[14px] text-[var(--color-muted)] md:flex-row">
        <Wordmark size={20} />
        <div className="flex items-center gap-6">
          <a href={GITHUB_URL} className="hover:text-[var(--color-ink)]">
            GitHub
          </a>
          <span>© {new Date().getFullYear()} Orchentra</span>
        </div>
      </div>
    </footer>
  )
}

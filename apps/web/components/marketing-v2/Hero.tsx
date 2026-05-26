'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { typewriterStep, type TypewriterPhase } from './typewriter'

function useTypewriter(
  words: readonly string[],
  opts: { type?: number; del?: number; hold?: number; enabled?: boolean } = {},
) {
  const { type = 70, del = 35, hold = 1400, enabled = true } = opts
  const [i, setI] = useState(0)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<TypewriterPhase>('typing')

  useEffect(() => {
    if (!enabled) return
    const next = typewriterStep({ words, index: i, text, phase, type, del, hold })
    const t = setTimeout(() => {
      setText(next.text)
      setPhase(next.phase)
      setI(next.index)
    }, next.delay)
    return () => clearTimeout(t)
  }, [text, phase, i, words, type, del, hold, enabled])

  return { text, index: i }
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
}

const STATES = [
  { glyph: '●', label: 'Operating', pulse: true },
  { glyph: '◆', label: 'Thinking', pulse: false },
  { glyph: '✱', label: 'Processing', pulse: false },
  { glyph: '▲', label: 'Optimizing', pulse: false },
] as const

const NOUNS = ['operators', 'debuggers', 'responders', 'engineers'] as const

const TABS = [
  {
    key: 'triage',
    label: 'Triage CI',
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3l2 2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'investigate',
    label: 'Investigate node',
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5l3 3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'replay',
    label: 'Replay graph',
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 8a5 5 0 0 1 8.5-3.5L13 6M13 3v3h-3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 8a5 5 0 0 1-8.5 3.5L3 10M3 13v-3h3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
] as const

function StatusPill() {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)

  useEffect(() => {
    if (reduce) return
    const t = setInterval(() => setI((n) => (n + 1) % STATES.length), 2400)
    return () => clearInterval(t)
  }, [reduce])

  const s = STATES[i]

  return (
    <motion.span
      aria-hidden="true"
      layout
      transition={{ layout: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
      className="inline-flex h-7 items-center gap-2 rounded-lg bg-[var(--color-pg-surface-1)]/70 px-3 text-[11px] font-medium tracking-wide text-[var(--color-pg-accent-green)] backdrop-blur-sm"
    >
      <span className="relative flex h-3 w-3 items-center justify-center text-[10px] leading-none">
        {s.pulse && (
          <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-[var(--color-pg-accent-green)] opacity-60" />
        )}
        <span className="relative">{s.glyph}</span>
      </span>
      <span className="whitespace-nowrap leading-none">{s.label}…</span>
    </motion.span>
  )
}

function CyclingNoun() {
  const reduce = useReducedMotion()
  const { text, index } = useTypewriter(NOUNS, { type: 80, del: 40, hold: 1500, enabled: !reduce })
  const display = reduce ? NOUNS[0] : text

  return (
    <span className="whitespace-nowrap font-normal not-italic tracking-[-0.03em] text-[var(--color-pg-accent-green)]">
      <span aria-hidden="true">{display}</span>
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {reduce ? NOUNS[0] : NOUNS[index]}
      </span>
    </span>
  )
}

function InstallBar({ loginHref, onLogin }: { loginHref: string; onLogin?: () => void }) {
  const [copied, setCopied] = useState(false)
  const cmd = 'npm i -g @orchentra/cli'

  const copy = () => {
    void navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const ctaClass =
    'inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pg-text-0)] px-5 py-2.5 text-sm font-medium text-[var(--color-pg-surface-0)] shadow-[0_4px_14px_-6px_rgba(20,20,19,0.4)] transition-all hover:bg-[#3a3a38]'
  const arrow = (
    <svg viewBox="0 0 12 12" className="h-3 w-3 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

  return (
    <div className="flex items-center gap-2 rounded-xl bg-[var(--color-pg-surface-1)]/80 p-1.5 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.1)] backdrop-blur-sm">
      {onLogin ? (
        <button type="button" onClick={onLogin} className={ctaClass}>
          Get Orchentra
          {arrow}
        </button>
      ) : (
        <Link href={loginHref} className={ctaClass}>
          Get Orchentra
          {arrow}
        </Link>
      )}
      <div className="flex items-center gap-2 pl-2 pr-3">
        <code className="font-[family-name:var(--font-mono)] text-[13px] whitespace-nowrap text-[var(--color-pg-text-0)]">
          <span className="text-[var(--color-pg-accent-green)]">$</span> {cmd}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="copy install command"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-pg-text-mute)] transition-colors hover:bg-[var(--color-pg-surface-2)] hover:text-[var(--color-pg-text-0)]"
        >
          {copied ? (
            <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 7.5l2.5 2.5L11 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
              <path d="M5.5 3.5V2.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

function TabNav() {
  return (
    <ul
      aria-label="Featured operations"
      className="inline-flex items-center gap-1 rounded-xl bg-[var(--color-pg-surface-1)]/70 p-1.5 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08)] backdrop-blur-sm"
    >
      {TABS.map((t, i) => {
        const isActive = i === 0
        return (
          <li key={t.key} className="relative inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium">
            {isActive && (
              <span className="absolute inset-0 rounded-lg bg-[var(--color-pg-surface-0)] shadow-[0_2px_8px_-4px_rgba(0,0,0,0.12)]" />
            )}
            <span
              className={`relative ${isActive ? 'text-[var(--color-pg-accent-green)]' : 'text-[var(--color-pg-text-mute)]'}`}
            >
              {t.icon}
            </span>
            <span
              className={`relative ${isActive ? 'text-[var(--color-pg-text-0)]' : 'text-[var(--color-pg-text-mute)]'}`}
            >
              {t.label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

interface HeroProps {
  loginHref: string
  onLogin?: () => void
}

export function Hero({ loginHref, onLogin }: HeroProps) {
  const reduce = useReducedMotion()

  return (
    <section className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pt-24 pb-40 text-center">
      <motion.div
        initial={reduce ? false : 'hidden'}
        animate={reduce ? undefined : 'show'}
        variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } }}
        className="flex flex-col items-center"
      >
        <motion.div variants={fadeUp}>
          <StatusPill />
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mt-10 max-w-3xl font-[family-name:var(--font-serif)] text-[3rem] font-medium leading-[1.02] tracking-tight text-[var(--color-pg-text-0)] md:text-[5rem]"
        >
          Built for <span className="text-[var(--color-pg-text-mute)]">⟩</span> <CyclingNoun />
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-8 max-w-2xl text-base leading-relaxed text-[var(--color-pg-text-mute)] md:text-lg"
        >
          The DevOps runtime that remembers every execution. One operations registry — CLI, MCP, and a graph that
          survives the incident.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-12">
          <InstallBar loginHref={loginHref} onLogin={onLogin} />
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          <TabNav />
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          <Link
            href="/docs"
            className="text-sm text-[var(--color-pg-text-mute)] underline decoration-[var(--color-pg-text-mute)]/40 underline-offset-4 transition-colors hover:text-[var(--color-pg-text-0)] hover:decoration-[var(--color-pg-text-0)]"
          >
            Or read the documentation
          </Link>
        </motion.div>
      </motion.div>
    </section>
  )
}

'use client'

import Link from 'next/link'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { ASCIIMascot } from './ASCIIMascot'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
}

export function Hero({ loginHref }: { loginHref: string }) {
  const reduce = useReducedMotion()

  return (
    <section className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pt-32 pb-40 text-center">
      <motion.div
        initial={reduce ? false : 'hidden'}
        animate={reduce ? undefined : 'show'}
        variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } }}
        className="flex flex-col items-center"
      >
        <motion.span
          variants={fadeUp}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-pg-surface-1)]/70 px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-[var(--color-pg-accent-green)] backdrop-blur-sm"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-pg-accent-green)] opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-pg-accent-green)]" />
          </span>
          Operating…
        </motion.span>

        <motion.h1
          variants={fadeUp}
          className="mt-10 max-w-3xl font-[family-name:var(--font-serif)] text-[3rem] font-medium leading-[1.02] tracking-tight text-[var(--color-pg-text-0)] md:text-[5rem]"
        >
          Built for{' '}
          <span className="relative inline-block">
            <span className="text-[var(--color-pg-text-mute)]">⟩</span>
          </span>{' '}
          <span className="font-[family-name:var(--font-display)] italic text-[var(--color-pg-accent-green)]">
            operators
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-8 max-w-2xl text-base leading-relaxed text-[var(--color-pg-text-mute)] md:text-lg"
        >
          The DevOps runtime that remembers every execution. One operations registry — CLI, MCP, and a graph that
          survives the incident.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-12 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href={loginHref}
            className="rounded-full bg-[var(--color-pg-accent-green)] px-6 py-3 text-sm font-medium text-white shadow-[0_8px_24px_-12px_rgba(21,101,69,0.6)] transition-all hover:bg-[var(--color-pg-accent-green-2)] hover:shadow-[0_12px_32px_-12px_rgba(21,101,69,0.7)]"
          >
            Get Orchentra
          </Link>

          <div
            className="flex items-center gap-3 rounded-full bg-[var(--color-pg-surface-1)]/70 px-5 py-3 text-sm shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08)] backdrop-blur-sm"
            aria-label="install command"
          >
            <code className="font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-pg-text-0)]">
              <span className="text-[var(--color-pg-accent-green)]">$</span> npm i -g @orchentra/cli
            </code>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          <Link
            href="/docs"
            className="text-sm text-[var(--color-pg-text-mute)] underline decoration-[var(--color-pg-text-mute)]/40 underline-offset-4 transition-colors hover:text-[var(--color-pg-text-0)] hover:decoration-[var(--color-pg-text-0)]"
          >
            Or read the documentation
          </Link>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94 }}
          animate={reduce ? undefined : { opacity: 0.8, scale: 1 }}
          transition={{ duration: 1.4, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none mt-24 w-full max-w-2xl"
        >
          <ASCIIMascot className="mx-auto opacity-90" />
        </motion.div>
      </motion.div>
    </section>
  )
}

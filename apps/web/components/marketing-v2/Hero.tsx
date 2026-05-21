'use client'

import Link from 'next/link'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { ASCIIMascot } from './ASCIIMascot'

export function Hero({ loginHref }: { loginHref: string }) {
  const reduce = useReducedMotion()

  const baseVariants: Variants = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
  }

  return (
    <section className="mx-auto max-w-6xl px-6 pt-14 pb-20">
      {/* tabular header strip */}
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={reduce ? undefined : { opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="flex items-center justify-between border-y border-[var(--color-pg-hairline)] py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-pg-text-mute)]"
      >
        <span>visual identity</span>
        <span className="hidden md:block">follow us · x, github</span>
        <span>[01]</span>
        <span>↳ next</span>
      </motion.div>

      <motion.div
        initial={reduce ? false : 'hidden'}
        animate={reduce ? undefined : 'show'}
        variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } }}
        className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-[1fr_1.1fr] md:items-center"
      >
        <div>
          <motion.div
            variants={baseVariants}
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-pg-text-mute)]"
          >
            athrean · orchentra
          </motion.div>

          <motion.h1
            variants={baseVariants}
            className="mt-8 text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-[var(--color-pg-text-0)] md:text-[3.6rem]"
          >
            the DevOps runtime
            <br />
            that remembers every
            <br />
            <span className="italic text-[var(--color-pg-accent-green)]">execution.</span>
          </motion.h1>
          <motion.p
            variants={baseVariants}
            className="mt-6 max-w-xl text-base text-[var(--color-pg-text-mute)] md:text-lg"
          >
            one operations registry. CLI, MCP, and a graph that survives the incident.
          </motion.p>

          <motion.div
            variants={baseVariants}
            className="mt-8 inline-flex items-center gap-3 border border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] px-4 py-3 text-sm"
            aria-label="install command"
          >
            <span className="text-[var(--color-pg-text-mute)]">$</span>
            <code className="text-[var(--color-pg-text-0)]">pnpm i -g @orchentra/cli</code>
          </motion.div>

          <motion.div variants={baseVariants} className="mt-8 flex items-center gap-3">
            <Link
              href={loginHref}
              className="border border-[var(--color-pg-accent-green)] bg-[var(--color-pg-accent-green)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-pg-accent-green-2)] hover:border-[var(--color-pg-accent-green-2)]"
            >
              sign in
            </Link>
            <Link
              href="/docs"
              className="border border-[var(--color-pg-text-0)] px-5 py-2.5 text-sm text-[var(--color-pg-text-0)] transition-colors hover:bg-[var(--color-pg-text-0)] hover:text-[var(--color-pg-surface-0)]"
            >
              docs
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.96 }}
          animate={reduce ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <ASCIIMascot />
        </motion.div>
      </motion.div>
    </section>
  )
}

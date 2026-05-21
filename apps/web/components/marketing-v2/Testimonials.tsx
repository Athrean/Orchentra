'use client'

import { motion, useReducedMotion, type Variants } from 'framer-motion'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
}

const QUOTES = [
  {
    org: 'Platform team · Series B fintech',
    quote:
      'Orchentra turned every CI failure into a node we can replay. The first time the on-call brief landed in 30 seconds we knew we were done shopping.',
    author: 'Anonymized',
    role: 'Staff engineer',
    initials: 'SE',
  },
  {
    org: 'DevTools agency',
    quote:
      'We wired the MCP server into Claude Desktop in an afternoon. Same registry as the CLI — exactly what we wanted from a runtime.',
    author: 'Anonymized',
    role: 'Founder',
    initials: 'FO',
  },
]

export function Testimonials() {
  const reduce = useReducedMotion()

  return (
    <section className="relative mx-auto max-w-6xl px-6 py-32">
      <motion.div
        initial={reduce ? false : 'hidden'}
        whileInView={reduce ? undefined : 'show'}
        viewport={{ once: true, margin: '-100px' }}
        variants={{ show: { transition: { staggerChildren: 0.1 } } }}
      >
        <motion.div variants={fadeUp} className="max-w-2xl">
          <span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-[var(--color-pg-accent-green)]">
            · testimonials
          </span>
          <h2 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium leading-[1.1] tracking-tight text-[var(--color-pg-text-0)] md:text-[3rem]">
            Trusted by{' '}
            <span className="font-[family-name:var(--font-display)] italic text-[var(--color-pg-accent-green)]">
              trailblazers
            </span>
          </h2>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
          {QUOTES.map((q) => (
            <motion.div
              key={q.org}
              variants={fadeUp}
              className="flex flex-col rounded-3xl bg-[var(--color-pg-surface-1)]/70 p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.15)] backdrop-blur-sm md:p-10"
            >
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-pg-surface-0)] px-3 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-pg-text-mute)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-pg-accent-green)]" />
                {q.org}
              </span>
              <p className="mt-6 font-[family-name:var(--font-serif)] text-xl leading-snug text-[var(--color-pg-text-0)] md:text-2xl">
                &ldquo;{q.quote}&rdquo;
              </p>
              <div className="mt-8 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-pg-text-0)] font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-pg-surface-0)]">
                  {q.initials}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-[var(--color-pg-text-0)]">{q.author}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-[var(--color-pg-text-mute)]">
                    {q.role}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  )
}

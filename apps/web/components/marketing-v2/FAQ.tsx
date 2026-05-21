'use client'

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'

const QUESTIONS = [
  {
    q: 'What is an Operation?',
    a: 'A typed, schema-validated unit of work. Operations live in one registry, and the runtime exposes them as both CLI verbs and MCP tools — same contract behind both.',
  },
  {
    q: 'Is the MCP server hosted?',
    a: 'Today stdio is shipped — Claude Desktop, Cursor, Windsurf wire it in via their mcpServers config. HTTP transport ships with the same contract; hosted is gated on real demand.',
  },
  {
    q: 'How is the graph persisted?',
    a: 'Each invocation produces an execution; tool calls and decisions land as nodes. The pair survives the incident — searchable, diffable, replayable.',
  },
  {
    q: 'Can I self-host?',
    a: 'Yes. Open source, terminal-native. The CLI ships against your own server; the MCP server runs locally. No vendor lock.',
  },
  {
    q: 'Which integrations are wired today?',
    a: 'GitHub webhooks (workflow_run for CI failure, cron for scheduled ops). Phase 5 expands integrations once usage data points at the next adapter.',
  },
  {
    q: 'How do I install?',
    a: 'npm i -g @orchentra/cli, then orchentra doctor to verify your environment. The first run scaffolds .orchentra/ in your repo.',
  },
] as const

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
}

export function FAQ() {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section className="relative mx-auto max-w-6xl px-6 py-32">
      <motion.div
        initial={reduce ? false : 'hidden'}
        whileInView={reduce ? undefined : 'show'}
        viewport={{ once: true, margin: '-100px' }}
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
        className="grid grid-cols-1 gap-12 md:grid-cols-[0.8fr_1.4fr]"
      >
        <motion.div variants={fadeUp}>
          <span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-[var(--color-pg-accent-green)]">
            · faq
          </span>
          <h2 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium leading-[1.05] tracking-tight text-[var(--color-pg-text-0)] md:text-[3rem]">
            Frequently
            <br />
            <span className="font-[family-name:var(--font-display)] italic text-[var(--color-pg-accent-green)]">
              asked
            </span>
            <br />
            questions
          </h2>
        </motion.div>

        <motion.ul variants={fadeUp} className="flex flex-col">
          {QUESTIONS.map((qa, i) => {
            const isOpen = open === i
            return (
              <li key={qa.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-6 py-6 text-left transition-colors hover:text-[var(--color-pg-accent-green)]"
                >
                  <span className="text-lg font-medium text-[var(--color-pg-text-0)] md:text-xl">{qa.q}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-pg-surface-1)] text-[var(--color-pg-text-0)]"
                    aria-hidden="true"
                  >
                    +
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pb-8 pr-12 text-base leading-relaxed text-[var(--color-pg-text-mute)]">{qa.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="h-px w-full bg-[var(--color-pg-hairline)]/40" />
              </li>
            )
          })}
        </motion.ul>
      </motion.div>
    </section>
  )
}

'use client'

import { useState } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'

const PILLARS = [
  {
    key: 'executions',
    title: 'Executions',
    body: 'Every run lives in the graph. Triggered by webhook, cron, CLI, or MCP — the runtime records it the same way.',
  },
  {
    key: 'nodes',
    title: 'Nodes',
    body: 'Decisions, tool calls, and outputs as typed nodes. `orchentra why <nodeId>` answers what and why.',
  },
  {
    key: 'mcp',
    title: 'MCP',
    body: 'The operations registry exposed to Claude Desktop, Cursor, and Windsurf over stdio. Trust enforcement stays in the runtime.',
  },
] as const

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
}

export function PillarFeatures() {
  const reduce = useReducedMotion()
  const [active, setActive] = useState<string>('executions')

  return (
    <section id="runtime" className="relative mx-auto max-w-6xl px-6 py-32">
      <motion.div
        initial={reduce ? false : 'hidden'}
        whileInView={reduce ? undefined : 'show'}
        viewport={{ once: true, margin: '-100px' }}
        variants={{ show: { transition: { staggerChildren: 0.1 } } }}
        className="grid grid-cols-1 items-center gap-16 md:grid-cols-[1.1fr_1fr]"
      >
        <div>
          <motion.h2
            variants={fadeUp}
            className="font-[family-name:var(--font-serif)] text-4xl font-medium leading-[1.1] tracking-tight text-[var(--color-pg-text-0)] md:text-[3rem]"
          >
            Everything you need for{' '}
            <span className="font-[family-name:var(--font-display)] italic text-[var(--color-pg-accent-green)]">
              autonomous operations
            </span>
          </motion.h2>

          <motion.ul variants={fadeUp} className="mt-12 flex flex-col gap-2">
            {PILLARS.map((p) => {
              const isActive = active === p.key
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(p.key)}
                    onFocus={() => setActive(p.key)}
                    className={`group relative w-full rounded-2xl px-5 py-5 text-left transition-all ${
                      isActive
                        ? 'bg-[var(--color-pg-surface-1)]/70 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.15)]'
                        : 'hover:bg-[var(--color-pg-surface-1)]/40'
                    }`}
                  >
                    <div className="flex items-baseline gap-3">
                      <span
                        className={`font-[family-name:var(--font-mono)] text-xs ${
                          isActive ? 'text-[var(--color-pg-accent-green)]' : 'text-[var(--color-pg-text-mute)]'
                        }`}
                      >
                        0{PILLARS.indexOf(p) + 1}
                      </span>
                      <h3 className="text-lg font-medium text-[var(--color-pg-text-0)]">{p.title}</h3>
                    </div>
                    <p
                      className={`mt-2 text-sm leading-relaxed text-[var(--color-pg-text-mute)] transition-opacity ${
                        isActive ? 'opacity-100' : 'opacity-70'
                      }`}
                    >
                      {p.body}
                    </p>
                  </button>
                </li>
              )
            })}
          </motion.ul>
        </div>

        <motion.div
          variants={fadeUp}
          className="relative flex aspect-square items-center justify-center"
          aria-hidden="true"
        >
          <ConcentricRings activeIndex={PILLARS.findIndex((p) => p.key === active)} />
        </motion.div>
      </motion.div>
    </section>
  )
}

function ConcentricRings({ activeIndex }: { activeIndex: number }) {
  const reduce = useReducedMotion()
  const labels = ['Branch-aware', 'Built-in graph', 'Sub-second latency']

  return (
    <div className="relative h-full w-full">
      {[280, 200, 120].map((size, i) => {
        const isActive = activeIndex === i
        return (
          <motion.div
            key={size}
            initial={reduce ? false : { scale: 0.92, opacity: 0 }}
            whileInView={reduce ? undefined : { scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: size * 1.6,
              height: size * 1.6,
              border: `1px dashed ${isActive ? 'var(--color-pg-accent-green)' : 'var(--color-pg-hairline)'}`,
              transition: 'border-color 0.5s ease',
            }}
          >
            <span
              className={`absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-pg-surface-0)] px-3 py-0.5 text-[10px] uppercase tracking-wider ${
                isActive ? 'text-[var(--color-pg-accent-green)]' : 'text-[var(--color-pg-text-mute)]'
              }`}
            >
              {labels[i]}
            </span>
          </motion.div>
        )
      })}

      <motion.div
        initial={reduce ? false : { scale: 0, opacity: 0 }}
        whileInView={reduce ? undefined : { scale: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--color-pg-text-0)] text-[var(--color-pg-surface-0)] shadow-[0_18px_40px_-12px_rgba(20,20,19,0.45)]"
      >
        <span className="font-[family-name:var(--font-serif)] text-3xl italic">a</span>
      </motion.div>
    </div>
  )
}

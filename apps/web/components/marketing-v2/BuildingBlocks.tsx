'use client'

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
}

interface Block {
  no: string
  label: string
  body: string
  icon: ReactNode
}

const BLOCKS: Block[] = [
  {
    no: '01',
    label: 'Operations',
    body: 'Typed, schema-validated units of work. The contract behind every CLI verb and MCP tool.',
    icon: <IconBlocks />,
  },
  {
    no: '02',
    label: 'Graph',
    body: 'Executions and nodes — searchable, diffable, replayable. The audit trail you actually keep.',
    icon: <IconGraph />,
  },
  {
    no: '03',
    label: 'MCP',
    body: 'stdio + HTTP transports. Wire Claude Desktop, Cursor, Windsurf to the same registry as the CLI.',
    icon: <IconMcp />,
  },
  {
    no: '04',
    label: 'Hooks',
    body: 'Pre/post tool-use shell commands per workspace. Pre-hook stderr blocks the call.',
    icon: <IconHook />,
  },
  {
    no: '05',
    label: 'Themes',
    body: 'Six built-in palettes including high-contrast. The terminal looks how you want it.',
    icon: <IconPalette />,
  },
  {
    no: '06',
    label: 'Adapters',
    body: 'GitHub today, more when usage data points there. Each adapter = one webhook = one kind.',
    icon: <IconAdapter />,
  },
]

export function BuildingBlocks() {
  const reduce = useReducedMotion()

  return (
    <section className="relative mx-auto max-w-6xl px-6 py-32">
      <motion.div
        initial={reduce ? false : 'hidden'}
        whileInView={reduce ? undefined : 'show'}
        viewport={{ once: true, margin: '-100px' }}
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      >
        <motion.div variants={fadeUp} className="max-w-2xl">
          <h2 className="font-[family-name:var(--font-serif)] text-4xl font-medium leading-[1.1] tracking-tight text-[var(--color-pg-text-0)] md:text-[3rem]">
            Building blocks for{' '}
            <span className="font-[family-name:var(--font-display)] italic text-[var(--color-pg-accent-green)]">
              reliability and scale
            </span>
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--color-pg-text-mute)]">
            One operations registry, one graph, one MCP server — used wherever the engineer already works.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BLOCKS.map((b) => (
            <motion.div
              key={b.no}
              variants={fadeUp}
              whileHover={reduce ? undefined : { y: -4 }}
              transition={{ duration: 0.3 }}
              className="group relative overflow-hidden rounded-3xl bg-[var(--color-pg-surface-1)]/60 p-7 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.1)] backdrop-blur-sm transition-shadow hover:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.15)]"
            >
              <div className="flex items-start justify-between">
                <div className="text-[var(--color-pg-accent-green)]">{b.icon}</div>
                <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-[var(--color-pg-text-mute)]">
                  no. {b.no}
                </span>
              </div>
              <h3 className="mt-12 font-[family-name:var(--font-serif)] text-2xl font-medium text-[var(--color-pg-text-0)]">
                {b.label}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-pg-text-mute)]">{b.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  )
}

function IconBlocks() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}
function IconGraph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="5" cy="6" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M 7 6 L 10 11 M 14 11 L 17 6 M 14 13 L 17 18 M 7 18 L 10 13" />
    </svg>
  )
}
function IconMcp() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="12" cy="12" r="3" />
      <circle cx="4" cy="6" r="2" />
      <circle cx="4" cy="18" r="2" />
      <circle cx="20" cy="6" r="2" />
      <circle cx="20" cy="18" r="2" />
      <path d="M 6 6 L 9 11 M 6 18 L 9 13 M 18 6 L 15 11 M 18 18 L 15 13" />
    </svg>
  )
}
function IconHook() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M 12 3 L 12 12 a 5 5 0 0 1 -10 0" />
      <circle cx="12" cy="20" r="2" />
    </svg>
  )
}
function IconPalette() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="9" r="1.4" />
      <circle cx="15" cy="9" r="1.4" />
      <circle cx="9" cy="15" r="1.4" />
      <circle cx="15" cy="15" r="1.4" />
    </svg>
  )
}
function IconAdapter() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="3" y="9" width="18" height="10" rx="1" />
      <path d="M 7 9 V 5 a 2 2 0 0 1 2 -2 h 6 a 2 2 0 0 1 2 2 V 9" />
      <line x1="9" y1="14" x2="9" y2="14.01" />
      <line x1="15" y1="14" x2="15" y2="14.01" />
    </svg>
  )
}

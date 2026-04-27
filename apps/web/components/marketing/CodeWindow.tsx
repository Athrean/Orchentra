'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '../../lib/utils'

export interface CodeLine {
  text: string
  tone?: 'default' | 'muted' | 'coral' | 'amber' | 'teal'
  prefix?: string
}

export function CodeWindow({
  title = 'orchentra · investigation',
  lines,
  className,
  animated = true,
}: {
  title?: string
  lines: CodeLine[]
  className?: string
  animated?: boolean
}): React.ReactNode {
  const reduce = useReducedMotion()
  const stagger = animated && !reduce
  const toneClass: Record<NonNullable<CodeLine['tone']>, string> = {
    default: 'mk-text-on-dark',
    muted: 'mk-text-on-dark-soft',
    coral: 'mk-text-coral',
    amber: 'text-[var(--color-accent-amber)]',
    teal: 'text-[var(--color-accent-teal)]',
  }
  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07, delayChildren: 0.2 } },
  }
  const lineVariants = {
    hidden: { opacity: 0, x: -8 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
  }
  return (
    <div className={cn('mk-surface-dark overflow-hidden rounded-xl shadow-2xl', className)}>
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <span className="block h-3 w-3 rounded-full bg-[#ff6155]" />
        <span className="block h-3 w-3 rounded-full bg-[#ffbe2e]" />
        <span className="block h-3 w-3 rounded-full bg-[#36cd4b]" />
        <span className="ml-3 mk-mono text-[12px] mk-text-on-dark-soft">{title}</span>
      </div>
      <motion.div
        className="mk-surface-dark-soft mk-mono px-5 py-5 text-[13px] leading-[1.7]"
        initial={stagger ? 'hidden' : false}
        whileInView={stagger ? 'visible' : undefined}
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger ? containerVariants : undefined}
      >
        {lines.map((line, idx) => (
          <motion.div key={idx} className="flex gap-3" variants={stagger ? lineVariants : undefined}>
            {line.prefix !== undefined && <span className="mk-text-on-dark-soft select-none">{line.prefix}</span>}
            <span className={toneClass[line.tone ?? 'default']}>{line.text || ' '}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

'use client'

import { motion, useReducedMotion, type Variants } from 'framer-motion'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
}

const POINTS = [
  { x: 0, y: 60 },
  { x: 10, y: 52 },
  { x: 20, y: 44 },
  { x: 30, y: 38 },
  { x: 40, y: 34 },
  { x: 50, y: 31 },
  { x: 60, y: 29 },
  { x: 70, y: 28 },
  { x: 80, y: 27 },
  { x: 90, y: 26 },
  { x: 100, y: 26 },
]

const PATH = POINTS.reduce((acc, p, i) => `${acc}${i === 0 ? 'M' : 'L'} ${p.x} ${p.y} `, '')

export function LiveGraphCard() {
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
            · runtime
          </span>
          <h2 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium leading-[1.1] tracking-tight text-[var(--color-pg-text-0)] md:text-[3rem]">
            State of the art runtime,{' '}
            <span className="font-[family-name:var(--font-display)] italic text-[var(--color-pg-accent-green)]">
              built for the graph
            </span>
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--color-pg-text-mute)]">
            Light-weight executions in-house outperform monolithic pipelines. Each operation runs as a typed unit;
            results land in the graph in under a second.
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="relative mt-14 overflow-hidden rounded-3xl bg-[var(--color-pg-surface-1)]/70 p-6 shadow-[0_30px_80px_-30px_rgba(20,20,19,0.25)] backdrop-blur-sm md:p-10"
        >
          <div className="rounded-2xl bg-[var(--color-pg-surface-0)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <div className="flex items-baseline justify-between">
              <span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wider text-[var(--color-pg-text-mute)]">
                Execution latency
              </span>
              <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-pg-text-mute)]">
                last 12h
              </span>
            </div>

            <div className="relative mt-6 aspect-[3/1] w-full">
              <svg viewBox="0 0 100 80" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {[0, 20, 40, 60, 80].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    y1={y}
                    x2="100"
                    y2={y}
                    stroke="var(--color-pg-hairline)"
                    strokeOpacity="0.5"
                    strokeWidth="0.2"
                    strokeDasharray="0.6 0.6"
                  />
                ))}

                <motion.path
                  d={PATH}
                  fill="none"
                  stroke="var(--color-pg-accent-green)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  whileInView={reduce ? undefined : { pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 2, ease: 'easeOut' }}
                />

                <motion.path
                  d={`${PATH} L 100 80 L 0 80 Z`}
                  fill="var(--color-pg-accent-green)"
                  fillOpacity="0.08"
                  initial={reduce ? false : { opacity: 0 }}
                  whileInView={reduce ? undefined : { opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.4, delay: 0.6 }}
                />

                {POINTS.filter((_, i) => i % 2 === 0).map((p, i) => (
                  <motion.circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r="0.7"
                    fill="var(--color-pg-accent-green)"
                    initial={reduce ? false : { scale: 0 }}
                    whileInView={reduce ? undefined : { scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: 1.2 + i * 0.05 }}
                  />
                ))}
              </svg>
            </div>

            <div className="mt-6 flex justify-between font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--color-pg-text-mute)]">
              {['12h', '8h', '6h', '4h', '2h', 'now'].map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}

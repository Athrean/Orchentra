'use client'

import { motion, useReducedMotion, type Variants } from 'framer-motion'

type Status = 'running' | 'succeeded' | 'queued' | 'failed'

const ROWS: { id: string; kind: string; started: string; duration: string; status: Status }[] = [
  { id: 'exe_8m2a', kind: 'webhook · ci_failure', started: '12:04:22', duration: '01:38', status: 'running' },
  { id: 'exe_7n1b', kind: 'cron · nightly_audit', started: '11:58:09', duration: '00:42', status: 'succeeded' },
  { id: 'exe_7m9c', kind: 'cli · investigate', started: '11:52:41', duration: '02:11', status: 'succeeded' },
  { id: 'exe_7m4d', kind: 'mcp · graph.query', started: '11:48:03', duration: '00:09', status: 'succeeded' },
  { id: 'exe_7l9e', kind: 'webhook · workflow_run', started: '11:44:12', duration: '00:00', status: 'queued' },
  { id: 'exe_7l2f', kind: 'cron · health_probe', started: '11:38:58', duration: '00:14', status: 'failed' },
]

const STATUS_DOT: Record<Status, string> = {
  running: 'bg-[var(--color-pg-accent-green)]',
  succeeded: 'bg-[var(--color-pg-accent-green-2)]/80',
  queued: 'bg-[var(--color-pg-text-mute)]/50',
  failed: 'bg-[#b94a3b]',
}

const STATUS_LABEL: Record<Status, string> = {
  running: 'Running',
  succeeded: 'Succeeded',
  queued: 'Queued',
  failed: 'Failed',
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
}

export function ExecutionsTable() {
  const reduce = useReducedMotion()

  return (
    <section id="graph" className="relative mx-auto max-w-6xl px-6 py-32">
      <motion.div
        initial={reduce ? false : 'hidden'}
        whileInView={reduce ? undefined : 'show'}
        viewport={{ once: true, margin: '-100px' }}
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      >
        <motion.div variants={fadeUp} className="max-w-2xl">
          <span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-[var(--color-pg-accent-green)]">
            · graph
          </span>
          <h2 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium leading-[1.1] tracking-tight text-[var(--color-pg-text-0)] md:text-[3rem]">
            One graph for{' '}
            <span className="font-[family-name:var(--font-display)] italic text-[var(--color-pg-accent-green)]">
              every kind of run
            </span>
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--color-pg-text-mute)]">
            Whether a CI failure, a cron, a CLI invocation, or an MCP tool call — the same execution + nodes contract.
            Search, diff, replay.
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="relative mt-14 overflow-hidden rounded-3xl bg-[var(--color-pg-text-0)] p-6 shadow-[0_40px_100px_-40px_rgba(20,20,19,0.5)] md:p-8"
        >
          <div className="rounded-2xl bg-[#1f1e1d] p-1">
            <div className="grid grid-cols-[1.5fr_1.4fr_0.8fr_1fr] gap-4 px-5 py-4 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-[var(--color-pg-surface-2)]/60">
              <span>Execution</span>
              <span>Kind</span>
              <span>Duration</span>
              <span className="text-right">Status</span>
            </div>

            <div className="flex flex-col gap-1 p-1">
              {ROWS.map((row, i) => (
                <motion.div
                  key={row.id}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.05 }}
                  className="grid grid-cols-[1.5fr_1.4fr_0.8fr_1fr] items-center gap-4 rounded-xl px-4 py-4 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-pg-surface-0)]">
                    {row.id}
                  </div>
                  <div className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-pg-surface-2)]/70">
                    {row.kind}
                  </div>
                  <div className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-pg-surface-2)]/70">
                    {row.duration}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span className="relative flex h-1.5 w-1.5">
                      {row.status === 'running' && (
                        <span
                          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${STATUS_DOT[row.status]}`}
                        />
                      )}
                      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${STATUS_DOT[row.status]}`} />
                    </span>
                    <span className="text-xs text-[var(--color-pg-surface-2)]/80">{STATUS_LABEL[row.status]}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}

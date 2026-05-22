'use client'

import { useEffect, useRef, useState } from 'react'
import { useTypewriter } from './ASCIIType'

const CMD = '$ orchentra triage 2438'
const LINES = [
  '⏺ github.workflow_run.read({ id: 2438 })',
  '  ⎿ workflow: ci.yml · failed step: "pnpm test"',
  '⏺ github.repo.diff({ a: "HEAD~1", b: "HEAD" })',
  '  ⎿ 3 files changed · 12 +/- 4',
  '✦ thought for 9s — likely cause: drift in fixture seed',
]

export function CliDemo() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  const cmdOut = useTypewriter(CMD, { start: visible })
  const [lineIdx, setLineIdx] = useState(0)

  useEffect(() => {
    if (!ref.current) return
    const node = ref.current
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.4 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (cmdOut !== CMD) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setLineIdx(LINES.length)
      return
    }
    const id = window.setInterval(() => {
      setLineIdx((n) => (n >= LINES.length ? (window.clearInterval(id), n) : n + 1))
    }, 380)
    return () => window.clearInterval(id)
  }, [cmdOut])

  return (
    <section className="mx-auto max-w-6xl px-6 pb-24">
      <div
        ref={ref}
        className="border border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] font-mono"
        role="region"
        aria-label="CLI demo"
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-pg-hairline)] px-4 py-2 text-[11px] text-[var(--color-pg-text-mute)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-pg-text-mute)]" />
          <span>orchentra</span>
        </div>
        <pre className="overflow-x-auto px-4 py-5 text-sm leading-6 text-[var(--color-pg-text-0)]">
          {cmdOut}
          {cmdOut !== CMD && <span className="animate-pulse">▌</span>}
          {cmdOut === CMD &&
            LINES.slice(0, lineIdx).map((line, i) => (
              <span key={i} className="block text-[var(--color-pg-text-mute)]">
                {line}
              </span>
            ))}
        </pre>
      </div>
    </section>
  )
}

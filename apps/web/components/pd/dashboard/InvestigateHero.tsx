'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowUp, ChevronDown, Sparkles, Telescope } from 'lucide-react'

const SUGGESTIONS = [
  'Find traces with high latency',
  'Summarize user checkout flows',
  'Identify database bottlenecks',
] as const

const BACKGROUND_FRAME = '/back-frames/ezgif-frame-120.jpg'

export function InvestigateHero() {
  const router = useRouter()
  const [value, setValue] = useState('')

  function investigate(prompt: string) {
    const q = prompt.trim()
    if (!q) return
    router.push(`/workspace?q=${encodeURIComponent(q)}`)
  }

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-no-repeat opacity-90 saturate-110"
        style={{
          backgroundImage: `url(${BACKGROUND_FRAME})`,
          backgroundPosition: 'center bottom',
          backgroundSize: '100% auto',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.86)_34%,rgba(255,255,255,0.42)_62%,rgba(255,255,255,0.08)_100%),radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.86)_22%,rgba(255,255,255,0.46)_42%,transparent_68%)]"
      />
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center">
        <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-[14px] bg-pg-accent-green/10 text-pg-accent-green shadow-[0_0_0_1px_rgba(20,20,18,0.06)]">
          <Telescope className="h-5 w-5" />
        </span>
        <h1 className="text-center text-4xl font-semibold tracking-tight text-pg-text-0">Investigate</h1>
        <p className="mt-2 text-center text-sm text-pg-text-mute">Find anything about your traces.</p>

        {/* Ask box */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            investigate(value)
          }}
          className="surface mt-8 w-full p-3 shadow-[0_24px_70px_-42px_rgba(15,15,14,0.55),0_0_0_1px_rgba(20,20,18,0.06)]"
        >
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                investigate(value)
              }
            }}
            rows={2}
            placeholder="Ask anything..."
            className="w-full resize-none bg-transparent px-2 pt-1 text-sm leading-relaxed text-pg-text-0 outline-none placeholder:text-pg-text-mute"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="inset-chip flex items-center gap-1.5 px-3 py-1.5 text-xs text-pg-text-mute"
            >
              <Sparkles className="h-3.5 w-3.5" />
              All repos
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
            <button
              type="button"
              className="inset-chip flex items-center gap-1.5 px-3 py-1.5 text-xs text-pg-text-mute"
            >
              Fast
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
            <div className="flex-1" />
            <button
              type="submit"
              disabled={!value.trim()}
              aria-label="Investigate"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-pg-accent-green text-white transition-colors hover:bg-pg-accent-green-2 disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Suggested investigations */}
        <div className="mt-6 flex w-full flex-col gap-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => investigate(s)}
              className="group flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm text-pg-text-mute transition-colors hover:bg-pg-surface-1 hover:text-pg-text-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-pg-text-mute/60 transition-colors group-hover:text-pg-accent-green" />
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

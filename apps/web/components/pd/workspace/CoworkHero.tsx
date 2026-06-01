'use client'

import type { ChatStatus, FileUIPart } from 'ai'
import { Activity, AlertTriangle, Folder, LayoutList, Shuffle, Sparkles, Sunrise } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ChatComposer } from './ChatComposer'

const INVESTIGATE_SUGGESTIONS: { icon: LucideIcon; label: string }[] = [
  { icon: Sunrise, label: 'Optimize my week' },
  { icon: Folder, label: 'Organize my screenshots' },
  { icon: LayoutList, label: 'Find insights in files' },
]

const TRIAGE_SUGGESTIONS: { icon: LucideIcon; label: string }[] = [
  { icon: AlertTriangle, label: 'Summarize my recent CI failures' },
  { icon: Activity, label: 'Find traces with the highest latency' },
  { icon: LayoutList, label: 'Surface flaky tests from this week' },
]

interface CoworkHeroProps {
  value: string
  onValueChange: (value: string) => void
  onSend: () => void
  onStop?: () => void
  status: ChatStatus
  toolbar?: ReactNode
  actions?: ReactNode
  files?: FileUIPart[]
  onAddFiles?: (files: FileList) => void
  onRemoveFile?: (index: number) => void
  onMic?: () => void
  micActive?: boolean
  allowActCommands?: boolean
  mode?: 'investigate' | 'triage'
}

export function CoworkHero({
  value,
  onValueChange,
  onSend,
  onStop,
  status,
  toolbar,
  actions,
  files,
  onAddFiles,
  onRemoveFile,
  onMic,
  micActive,
  allowActCommands,
  mode = 'triage',
}: CoworkHeroProps) {
  const isInvestigate = mode === 'investigate'
  const suggestions = isInvestigate ? INVESTIGATE_SUGGESTIONS : TRIAGE_SUGGESTIONS
  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden px-6 py-10">
      <div className="relative z-10 mx-auto w-full max-w-3xl pt-[6vh]">
        <div className="mb-3 flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-[#d65f32]" strokeWidth={1.8} />
          <h1 className="font-serif text-[32px] font-semibold leading-tight tracking-normal text-pg-text-0">
            {isInvestigate ? "Let's knock something off your list" : 'Triage a failure with context'}
          </h1>
        </div>
        <p className="mb-7 pl-10 text-sm text-pg-text-mute">
          {isInvestigate
            ? 'Learn how to use Cowork safely.'
            : 'Send logs, screenshots, and CI context for a focused debug pass.'}
        </p>

        <ChatComposer
          value={value}
          onValueChange={onValueChange}
          onSend={onSend}
          onStop={onStop}
          status={status}
          toolbar={toolbar}
          actions={actions}
          files={files}
          onAddFiles={onAddFiles}
          onRemoveFile={onRemoveFile}
          onMic={onMic}
          micActive={micActive}
          allowActCommands={allowActCommands}
          autoFocus
        />

        <div className="mt-20 max-w-[calc(100%-1rem)] pl-3">
          <div className="mb-1 flex items-center gap-2 px-3 text-xs font-medium text-pg-text-mute">
            <Shuffle className="h-3.5 w-3.5" strokeWidth={1.6} />
            Pick a task, any task
          </div>
          <div className="flex flex-col">
            {suggestions.map(({ icon: Icon, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => onValueChange(label)}
                className="group flex min-h-16 items-center gap-5 border-b border-pg-hairline px-3 text-left text-sm text-pg-text-0 transition-colors hover:bg-pg-surface-card/60"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-pg-hairline bg-pg-surface-card text-pg-text-mute shadow-[0_8px_24px_-18px_rgba(15,15,14,0.45)] transition-colors group-hover:text-pg-accent-green">
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                </span>
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-1 px-3 py-2 text-xs text-pg-text-mute transition-colors hover:text-pg-text-0"
          >
            Customize with plugins
          </button>
        </div>
      </div>
    </div>
  )
}

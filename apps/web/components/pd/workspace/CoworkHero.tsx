'use client'

import type { ChatStatus, FileUIPart } from 'ai'
import { Activity, AlertTriangle, FlaskConical, Shuffle, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ChatComposer } from './ChatComposer'

const SUGGESTIONS: { icon: LucideIcon; label: string }[] = [
  { icon: AlertTriangle, label: 'Summarize my recent CI failures' },
  { icon: Activity, label: 'Find traces with the highest latency' },
  { icon: FlaskConical, label: 'Surface flaky tests from this week' },
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
}: CoworkHeroProps) {
  return (
    <div className="dot-canvas relative flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        <div className="mb-1.5 flex items-center gap-2.5">
          <Sparkles className="h-6 w-6 text-pg-accent-green" />
          <h1 className="text-3xl font-semibold tracking-tight text-pg-text-0">
            Let&apos;s knock something off your list
          </h1>
        </div>
        <p className="mb-6 pl-9 text-sm text-pg-text-mute">Investigate anything across your repositories and runs.</p>

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
          autoFocus
        />

        <div className="mt-10">
          <div className="mb-1 flex items-center gap-2 px-3 text-xs font-medium text-pg-text-mute">
            <Shuffle className="h-3.5 w-3.5" />
            Pick a task, any task
          </div>
          <div className="flex flex-col">
            {SUGGESTIONS.map(({ icon: Icon, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => onValueChange(label)}
                className="group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm text-pg-text-0 transition-colors hover:bg-pg-surface-1"
              >
                <Icon className="h-4 w-4 text-pg-text-mute transition-colors group-hover:text-pg-accent-green" />
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

'use client'

import { getToolName, isToolUIPart, type ChatStatus, type FileUIPart, type UIMessage } from 'ai'
import {
  AlertCircle,
  Check,
  FileText,
  FolderGit2,
  Hand,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Zap,
} from 'lucide-react'
import type { PermissionMode } from '../../../lib/ai/chat-request'
import type { Effort } from '../../../lib/ai/effort'
import { getModelLabel } from '../../../lib/ai/models'

interface ToolStep {
  key: string
  label: string
  state: 'running' | 'done' | 'error'
}

const EFFORT_LABELS: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', max: 'Max' }

function titleize(name: string): string {
  const text = name.replace(/_/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function collectSteps(messages: UIMessage[]): ToolStep[] {
  const steps: ToolStep[] = []
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    message.parts.forEach((part, index) => {
      if (!isToolUIPart(part)) return
      const state = part.state === 'output-error' ? 'error' : part.state === 'output-available' ? 'done' : 'running'
      steps.push({ key: `${message.id}-${index}`, label: titleize(getToolName(part)), state })
    })
  }
  return steps
}

function collectFiles(messages: UIMessage[]): FileUIPart[] {
  const files: FileUIPart[] = []
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'file') files.push(part)
    }
  }
  return files
}

export function CoworkRail({
  messages,
  status,
  model,
  effort,
  adaptive,
  permissionMode,
  scope,
}: {
  messages: UIMessage[]
  status: ChatStatus
  model: string
  effort: Effort
  adaptive: boolean
  permissionMode: PermissionMode
  scope: string
}) {
  const steps = collectSteps(messages)
  const files = collectFiles(messages)
  const isBusy = status === 'submitted' || status === 'streaming'
  const scopeLabel = scope === 'all-repos' ? 'All repos' : (scope.split('/').pop() ?? scope)

  return (
    <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-pg-hairline bg-pg-surface-0/60 px-5 py-6 lg:flex">
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-pg-text-mute">
          <Sparkles className="h-3.5 w-3.5 text-pg-accent-green" />
          Progress
        </h2>
        {steps.length === 0 ? (
          <p className="text-xs leading-5 text-pg-text-mute">
            {isBusy ? 'Working…' : 'Tool activity for this task will appear here.'}
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {steps.map((step) => (
              <li key={step.key} className="flex items-center gap-2.5 text-sm text-pg-text-0">
                <StepIcon state={step.state} />
                <span className="truncate">{step.label}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="h-px bg-pg-hairline" />

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-pg-text-mute">Context</h2>
        <dl className="flex flex-col gap-2.5 text-sm">
          <Row icon={<Sparkles className="h-3.5 w-3.5" />} label="Model" value={getModelLabel(model)} />
          <Row
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Effort"
            value={adaptive ? `${EFFORT_LABELS[effort]} · Adaptive` : EFFORT_LABELS[effort]}
          />
          <Row
            icon={<Hand className="h-3.5 w-3.5" />}
            label="Permission"
            value={permissionMode === 'ask' ? 'Ask before acting' : 'Act without asking'}
          />
          <Row icon={<FolderGit2 className="h-3.5 w-3.5" />} label="Scope" value={scopeLabel} />
        </dl>

        {files.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {files.map((file, index) => (
              <li
                key={`${file.filename}-${index}`}
                className="flex items-center gap-2 rounded-[8px] border border-pg-hairline bg-white px-2.5 py-1.5 text-xs text-pg-text-0"
              >
                {file.mediaType.startsWith('image/') ? (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-pg-text-mute" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-pg-text-mute" />
                )}
                <span className="truncate">{file.filename ?? file.mediaType}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}

function StepIcon({ state }: { state: ToolStep['state'] }) {
  if (state === 'running') return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-pg-accent-green" />
  if (state === 'error') return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
  return <Check className="h-3.5 w-3.5 shrink-0 text-pg-accent-green" />
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-pg-text-mute">{icon}</span>
      <dt className="text-pg-text-mute">{label}</dt>
      <dd className="ml-auto max-w-[55%] truncate text-right text-pg-text-0">{value}</dd>
    </div>
  )
}

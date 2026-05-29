'use client'

import { getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart, type UIMessage } from 'ai'
import { ChevronRight, Sparkles, Wrench } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../../lib/utils'

export function CoworkMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('mb-6 flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex min-w-0 flex-col gap-2', isUser ? 'max-w-[80%] items-end' : 'w-full')}>
        {message.parts.map((part, index) => {
          if (part.type === 'text') {
            return <TextPart key={index} text={part.text} isUser={isUser} />
          }
          if (part.type === 'reasoning') {
            return <ReasoningPart key={index} text={part.text} streaming={part.state === 'streaming'} />
          }
          if (part.type === 'file') {
            return <FilePart key={index} mediaType={part.mediaType} url={part.url} filename={part.filename} />
          }
          if (isToolUIPart(part)) {
            return <ToolPart key={index} part={part} />
          }
          return null
        })}
      </div>
    </div>
  )
}

function TextPart({ text, isUser }: { text: string; isUser: boolean }) {
  if (isUser) {
    return (
      <div className="whitespace-pre-wrap rounded-[14px] bg-pg-surface-1 px-4 py-2.5 text-sm leading-relaxed text-pg-text-0">
        {text}
      </div>
    )
  }
  return <div className="whitespace-pre-wrap text-sm leading-relaxed text-pg-text-0">{text}</div>
}

function ReasoningPart({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-xs text-pg-text-mute">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-[8px] px-1.5 py-1 transition-colors hover:text-pg-text-0"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {streaming ? 'thinking…' : 'thought'}
        <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
      </button>
      {open && <p className="mt-1 whitespace-pre-wrap pl-2 italic leading-5">{text}</p>}
    </div>
  )
}

function FilePart({ mediaType, url, filename }: { mediaType: string; url: string; filename?: string }) {
  if (mediaType.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={filename ?? ''} className="max-w-xs rounded-[10px] border border-pg-hairline" />
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-[8px] border border-pg-hairline bg-white px-3 py-2 text-xs text-pg-text-0 hover:bg-pg-surface-1"
    >
      {filename ?? mediaType}
    </a>
  )
}

function ToolPart({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const name = getToolName(part)
  const done = part.state === 'output-available' || part.state === 'output-error'
  return (
    <details className="rounded-[8px] border border-pg-hairline bg-white px-3 py-2 text-xs">
      <summary className="flex cursor-pointer items-center gap-2 text-pg-text-0">
        <Wrench className="h-3.5 w-3.5 text-pg-accent-green" />
        <span className="font-mono">{name}</span>
        <span className="text-pg-text-mute">{done ? '' : '· running…'}</span>
      </summary>
      <pre className="mt-2 overflow-x-auto text-pg-text-mute">
        {JSON.stringify({ input: part.input, output: part.output, error: part.errorText }, null, 2)}
      </pre>
    </details>
  )
}

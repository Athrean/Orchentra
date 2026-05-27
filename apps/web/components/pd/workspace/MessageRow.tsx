'use client'

import { Clock, Copy } from 'lucide-react'
import { formatRelative } from '../../../lib/utils'
import { StagePanel } from './StagePanel'
import type { ChatMessage, StageItem } from './types'

interface MessageRowProps {
  message: ChatMessage
  isStreaming?: boolean
  userAvatarUrl?: string | null
  stages?: StageItem[]
}

export function MessageRow({ message, isStreaming, userAvatarUrl, stages }: MessageRowProps) {
  if (message.role === 'user') {
    return (
      <div className="mb-4 flex w-full justify-end">
        <div className="flex max-w-[70%] flex-row-reverse items-start gap-x-2">
          <Avatar src={userAvatarUrl} />
          <div className="flex flex-col items-end">
            <div className="rounded-b-[10px] rounded-tl-[10px] bg-pg-accent-green px-4 py-2 text-sm tracking-wide text-white">
              {message.content}
            </div>
            <Footer createdAt={message.createdAt} content={message.content} align="end" />
          </div>
        </div>
      </div>
    )
  }

  if (message.role === 'assistant') {
    const showDots = isStreaming && message.content === ''
    return (
      <div className="mb-4 flex w-full justify-start">
        <div className="flex max-w-[70%] items-start gap-x-2">
          <div className="flex aspect-square h-8 w-8 items-center justify-center rounded-full border border-pg-hairline bg-white">
            <div className="h-3 w-3 rounded-[2px] bg-pg-accent-green" />
          </div>
          <div className="flex flex-col">
            <div className="mt-2.5 rounded-b-[10px] rounded-tr-[10px] border border-pg-hairline bg-white px-4 py-2 text-sm tracking-wider text-pg-text-0">
              {showDots ? <StreamingDots /> : message.content}
            </div>
            <Footer createdAt={message.createdAt} content={message.content} align="start" />
          </div>
        </div>
      </div>
    )
  }

  // System row: render StagePanel when stages provided, else plain centered note.
  if (stages && stages.length > 0) {
    return <StagePanel stages={stages} />
  }
  return (
    <div className="my-2 flex w-full justify-center">
      <span className="text-xs tracking-wide text-pg-text-mute">{message.content}</span>
    </div>
  )
}

function Avatar({ src }: { src?: string | null }) {
  if (src) {
    // Plain img keeps avatar handling outside next/image config.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="h-8 w-8 rounded-full border border-pg-hairline object-cover" />
  }
  return <div className="h-8 w-8 rounded-full border border-pg-hairline bg-pg-surface-1" />
}

function Footer({ createdAt, content, align }: { createdAt: Date; content: string; align: 'start' | 'end' }) {
  const onCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(content)
    }
  }
  return (
    <div
      className={`mt-1 flex items-center gap-2 text-xs text-pg-text-mute ${align === 'end' ? 'flex-row-reverse' : ''}`}
    >
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {formatRelative(createdAt)}
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center text-pg-text-mute transition-colors hover:text-pg-text-0"
        aria-label="Copy message"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  )
}

function StreamingDots() {
  return (
    <div className="flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-500 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-500 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-500" />
    </div>
  )
}

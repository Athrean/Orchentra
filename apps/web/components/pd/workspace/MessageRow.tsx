'use client'

import { Clock, Copy, ExternalLink, Wrench } from 'lucide-react'
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
            {message.reasoning ? (
              <details className="mt-2 rounded-[8px] border border-pg-hairline bg-white px-3 py-2 text-xs text-pg-text-mute">
                <summary className="cursor-pointer text-pg-text-0">Reasoning</summary>
                <p className="mt-2 whitespace-pre-wrap leading-5">{message.reasoning}</p>
              </details>
            ) : null}
            {message.stages && message.stages.length > 0 ? <StagePanel stages={message.stages} /> : null}
            {message.toolCalls && message.toolCalls.length > 0 ? <ToolCalls calls={message.toolCalls} /> : null}
            {message.sources && message.sources.length > 0 ? <Sources sources={message.sources} /> : null}
            {message.usage ? (
              <div className="mt-2 rounded-[8px] bg-pg-surface-0 px-3 py-2 text-xs text-pg-text-mute">
                {message.usage.totalTokens.toLocaleString()} tokens · ${message.usage.estimatedCostUsd.toFixed(4)} ·{' '}
                {message.usage.model}
              </div>
            ) : null}
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

function ToolCalls({ calls }: { calls: NonNullable<ChatMessage['toolCalls']> }) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {calls.map((call, index) => (
        <details
          key={`${call.name}-${index}`}
          className="rounded-[8px] border border-pg-hairline bg-white px-3 py-2 text-xs"
        >
          <summary className="flex cursor-pointer items-center gap-2 text-pg-text-0">
            <Wrench className="h-3.5 w-3.5" />
            {call.name}
          </summary>
          <pre className="mt-2 overflow-x-auto text-pg-text-mute">
            {JSON.stringify({ arguments: call.arguments, result: call.result }, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  )
}

function Sources({ sources }: { sources: NonNullable<ChatMessage['sources']> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((source) =>
        source.url ? (
          <a
            key={`${source.title}-${source.url}`}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-[6px] bg-pg-surface-0 px-2 py-1 text-xs text-pg-text-mute hover:text-pg-text-0"
          >
            {source.title}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span key={source.title} className="rounded-[6px] bg-pg-surface-0 px-2 py-1 text-xs text-pg-text-mute">
            {source.title}
          </span>
        ),
      )}
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

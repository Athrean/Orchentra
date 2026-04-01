'use client'

import { useRef, useEffect, useState } from 'react'
import { useChat, type Message } from 'ai/react'
import { Send, Loader2, Bot, User, Wrench } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useMe } from '../../lib/hooks'

// ── Stable suggested prompts ──────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  'What failed in the last 24 hours?',
  'Show me all open incidents',
  'Which workflows are failing most often?',
  'What repos am I monitoring?',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }): React.ReactElement {
  const isUser = msg.role === 'user'

  return (
    <div className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: isUser ? 'var(--color-brand-dim)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${isUser ? 'var(--color-brand-border)' : 'var(--color-app-border)'}`,
        }}
      >
        {isUser ? (
          <User className="w-3 h-3" style={{ color: 'var(--color-brand)' }} />
        ) : (
          <Bot className="w-3 h-3" style={{ color: 'var(--color-app-text-muted)' }} />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex flex-col gap-1 max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
        {/* Tool call indicators */}
        {msg.parts
          ?.filter((p) => p.type === 'tool-invocation')
          .map((p, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--color-app-text-subtle)',
                border: '1px solid var(--color-app-border)',
              }}
            >
              <Wrench className="w-2.5 h-2.5 shrink-0" />
              <span>{(p as { toolName?: string }).toolName ?? 'tool'}</span>
            </div>
          ))}

        {/* Text bubble */}
        {msg.content && (
          <div
            className={cn('text-xs rounded-xl px-3 py-2 leading-relaxed whitespace-pre-wrap')}
            style={{
              background: isUser ? 'var(--color-brand-dim)' : 'var(--color-app-raised)',
              border: `1px solid ${isUser ? 'var(--color-brand-border)' : 'var(--color-app-border)'}`,
              color: 'var(--color-app-text)',
            }}
          >
            {msg.content}
          </div>
        )}
      </div>
    </div>
  )
}

// ── ChatPanel ──────────────────────────────────────────────────────────────────

export interface ChatPanelProps {
  repo: string
}

export function ChatPanel({ repo }: ChatPanelProps): React.ReactElement {
  const { data: me } = useMe()
  const orgId = me?.org?.id

  // Stable session ID per browser tab — resets on hard refresh (intentional)
  const [sessionId] = useState(() => crypto.randomUUID())

  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput } = useChat({
    api: orgId ? `${getApiBase()}/api/orgs/${orgId}/chat` : undefined,
    body: { sessionId, repo },
    credentials: 'include',
    id: sessionId,
  })

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function onSuggestedPrompt(prompt: string): void {
    setInput(prompt)
    inputRef.current?.focus()
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 border-b shrink-0 flex items-center gap-2"
        style={{ borderColor: 'var(--color-app-border)' }}
      >
        <Bot className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-brand)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--color-app-text)' }}>
          Ask Orchentra
        </span>
        <span className="text-[10px] ml-auto" style={{ color: 'var(--color-app-text-subtle)' }}>
          {repo}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {isEmpty ? (
          <EmptyState onSelect={onSuggestedPrompt} />
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-2.5 items-start">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-app-border)' }}
            >
              <Bot className="w-3 h-3" style={{ color: 'var(--color-app-text-muted)' }} />
            </div>
            <div
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs"
              style={{
                background: 'var(--color-app-raised)',
                border: '1px solid var(--color-app-border)',
                color: 'var(--color-app-text-muted)',
              }}
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Thinking…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="px-3 pb-3 pt-2 border-t shrink-0"
        style={{ borderColor: 'var(--color-app-border)' }}
      >
        <div
          className="flex items-center gap-2 rounded-xl border px-3 py-2"
          style={{
            background: 'var(--color-app-deep)',
            borderColor: 'var(--color-app-border-hover)',
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about incidents, workflows, repos…"
            disabled={!orgId || isLoading}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-app-text-subtle)]"
            style={{ color: 'var(--color-app-text)' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || !orgId || isLoading}
            className="transition-colors disabled:opacity-40"
            style={{ color: isLoading ? 'var(--color-app-text-subtle)' : 'var(--color-brand)' }}
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onSelect }: { onSelect: (p: string) => void }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--color-brand-dim)', border: '1px solid var(--color-brand-border)' }}
      >
        <Bot className="w-5 h-5" style={{ color: 'var(--color-brand)' }} />
      </div>
      <div className="text-center">
        <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-app-text)' }}>
          Ask about your CI/CD
        </p>
        <p className="text-[10px]" style={{ color: 'var(--color-app-text-subtle)' }}>
          Query incidents, workflows, and repos in plain English
        </p>
      </div>
      <div className="flex flex-col gap-1.5 w-full">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSelect(prompt)}
            className="text-left text-[11px] px-3 py-2 rounded-lg transition-colors hover:border-white/10"
            style={{
              background: 'var(--color-app-raised)',
              border: '1px solid var(--color-app-border)',
              color: 'var(--color-app-text-secondary)',
            }}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

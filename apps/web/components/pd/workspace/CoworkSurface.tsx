'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PermissionMode } from '../../../lib/ai/chat-request'
import type { Effort } from '../../../lib/ai/effort'
import { DEFAULT_MODEL_ID } from '../../../lib/ai/models'
import { ChatComposer } from './ChatComposer'
import { CoworkMessage } from './CoworkMessage'

export function CoworkSurface({ initialPrompt }: { initialPrompt?: string | null }) {
  // Input selections. Setters are wired to the toolbar pickers in a later phase.
  const [model] = useState<string>(DEFAULT_MODEL_ID)
  const [effort] = useState<Effort>('low')
  const [adaptive] = useState(false)
  const [permissionMode] = useState<PermissionMode>('ask')
  const [scope] = useState('all-repos')

  const settingsRef = useRef({ model, effort, adaptive, permissionMode, scope })
  settingsRef.current = { model, effort, adaptive, permissionMode, scope }

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat', body: () => settingsRef.current }), [])
  const { messages, sendMessage, status, stop, error } = useChat({ transport })

  useEffect(() => {
    if (error) toast.error(error.message)
  }, [error])

  // Seed the first turn from the Investigate hero (?q=…) — fire once on mount.
  const seededRef = useRef(false)
  useEffect(() => {
    const seed = initialPrompt?.trim()
    if (seed && !seededRef.current) {
      seededRef.current = true
      void sendMessage({ text: seed })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, status])

  const send = (text: string) => void sendMessage({ text })

  if (messages.length === 0) {
    return (
      <div className="dot-canvas relative flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-6">
        <div className="w-full max-w-2xl">
          <h1 className="mb-6 text-center text-3xl font-semibold tracking-tight text-pg-text-0">
            Let&apos;s knock something off your list
          </h1>
          <ChatComposer onSend={send} onStop={stop} status={status} autoFocus />
        </div>
      </div>
    )
  }

  return (
    <div className="dot-canvas flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex-1 overflow-y-auto px-4 pt-8">
        <div className="mx-auto max-w-3xl">
          {messages.map((message) => (
            <CoworkMessage key={message.id} message={message} />
          ))}
          {status === 'submitted' && <ThinkingDots />}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="px-4 pb-5">
        <div className="mx-auto max-w-3xl">
          <ChatComposer onSend={send} onStop={stop} status={status} />
        </div>
      </div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="mb-6 flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pg-text-mute [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pg-text-mute [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pg-text-mute" />
    </div>
  )
}

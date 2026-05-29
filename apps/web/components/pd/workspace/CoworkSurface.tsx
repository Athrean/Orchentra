'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PermissionMode } from '../../../lib/ai/chat-request'
import type { Effort } from '../../../lib/ai/effort'
import { DEFAULT_MODEL_ID } from '../../../lib/ai/models'
import { ChatComposer } from './ChatComposer'
import { CoworkHero } from './CoworkHero'
import { CoworkMessage } from './CoworkMessage'

export function CoworkSurface({ initialPrompt }: { initialPrompt?: string | null }) {
  // Input selections. Setters are wired to the toolbar pickers in a later phase.
  const [model] = useState<string>(DEFAULT_MODEL_ID)
  const [effort] = useState<Effort>('low')
  const [adaptive] = useState(false)
  const [permissionMode] = useState<PermissionMode>('ask')
  const [scope] = useState('all-repos')
  const [draft, setDraft] = useState('')

  const settingsRef = useRef({ model, effort, adaptive, permissionMode, scope })
  settingsRef.current = { model, effort, adaptive, permissionMode, scope }

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat', body: () => settingsRef.current }), [])
  const { messages, sendMessage, status, stop, error } = useChat({ transport })

  useEffect(() => {
    if (error) toast.error(error.message)
  }, [error])

  // Seed the first turn from a deep link (?q=…) — fire once on mount.
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

  const submit = () => {
    const text = draft.trim()
    if (!text || status === 'submitted' || status === 'streaming') return
    void sendMessage({ text })
    setDraft('')
  }

  if (messages.length === 0) {
    return <CoworkHero value={draft} onValueChange={setDraft} onSend={submit} onStop={stop} status={status} />
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
          <ChatComposer value={draft} onValueChange={setDraft} onSend={submit} onStop={stop} status={status} />
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

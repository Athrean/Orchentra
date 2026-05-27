'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Composer } from './Composer'
import { EmptyComposer } from './EmptyComposer'
import { MessageRow } from './MessageRow'
import { streamChat } from './useChatStream'
import type { ChatMessage } from './types'

interface ChatThreadProps {
  initialMessages?: ChatMessage[]
  initialPrompt?: string | null
  userAvatarUrl?: string | null
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ChatThread({ initialMessages = [], initialPrompt = null, userAvatarUrl }: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const seededRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streamingContent])

  const handleSubmit = async (prompt: string) => {
    if (isStreaming) return
    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: prompt,
      createdAt: new Date(),
    }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setIsStreaming(true)
    setStreamingContent('')

    let accumulated = ''
    let errored = false
    await streamChat({
      messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
      onToken: (text) => {
        accumulated += text
        setStreamingContent(accumulated)
      },
      onError: (err) => {
        errored = true
        toast.error(err)
      },
    })

    if (!errored && accumulated) {
      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: accumulated,
        createdAt: new Date(),
      }
      setMessages((m) => [...m, assistantMsg])
    }
    setStreamingContent('')
    setIsStreaming(false)
  }

  // Seed from the Investigate hero (?q=…) — fire once on mount.
  useEffect(() => {
    const seed = initialPrompt?.trim()
    if (seed && !seededRef.current) {
      seededRef.current = true
      void handleSubmit(seed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isEmpty = messages.length === 0 && !isStreaming

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-pg-surface-0">
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-3xl">
            <EmptyComposer />
            <Composer onSubmit={handleSubmit} disabled={isStreaming} />
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-6">
            <div className="mx-auto max-w-3xl">
              {messages.map((m) => (
                <MessageRow key={m.id} message={m} userAvatarUrl={userAvatarUrl} />
              ))}
              {isStreaming && (
                <MessageRow
                  message={{
                    id: 'streaming',
                    role: 'assistant',
                    content: streamingContent,
                    createdAt: new Date(),
                  }}
                  isStreaming
                  userAvatarUrl={userAvatarUrl}
                />
              )}
              <div ref={bottomRef} />
            </div>
          </div>
          <div className="border-t border-pg-hairline px-4 py-3">
            <div className="mx-auto max-w-3xl">
              <Composer onSubmit={handleSubmit} disabled={isStreaming} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

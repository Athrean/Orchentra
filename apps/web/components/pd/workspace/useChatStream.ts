'use client'

import type { ChatMessage } from './types'

interface StreamOpts {
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
  onToken: (chunk: string) => void
  onError?: (error: string) => void
  signal?: AbortSignal
}

/**
 * Consume the /api/chat Server-Sent Events stream.
 * Each SSE frame is `data: <json>\n\n`; the json shape is the ChatChunk
 * union defined in lib/llm/types.ts (`{ type: 'token' | 'done' | 'error', text?, error? }`).
 */
export async function streamChat({ messages, onToken, onError, signal }: StreamOpts): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })

  if (!res.ok || !res.body) {
    let msg = `request failed (${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) msg = body.error
    } catch {
      // body wasn't JSON; keep the status-based message
    }
    onError?.(msg)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      let chunk: { type: string; text?: string; error?: string }
      try {
        chunk = JSON.parse(payload)
      } catch {
        continue
      }
      if (chunk.type === 'token' && chunk.text) onToken(chunk.text)
      else if (chunk.type === 'error') onError?.(chunk.error ?? 'stream failed')
    }
  }
}

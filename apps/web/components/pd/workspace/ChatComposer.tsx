'use client'

import type { ChatStatus } from 'ai'
import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../../lib/utils'

interface ChatComposerProps {
  onSend: (text: string) => void
  onStop?: () => void
  status: ChatStatus
  placeholder?: string
  autoFocus?: boolean
  /** Toolbar controls rendered on the bottom-left (scope / permission / model pickers). */
  toolbar?: ReactNode
  /** Extra actions rendered to the left of the send button (attach / mic). */
  actions?: ReactNode
}

const MAX = 8000

export function ChatComposer({ onSend, onStop, status, placeholder, autoFocus, toolbar, actions }: ChatComposerProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const isBusy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const autosize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || isBusy) return
    onSend(trimmed)
    setValue('')
    requestAnimationFrame(autosize)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="surface w-full p-2.5">
      <textarea
        ref={ref}
        value={value}
        rows={1}
        onChange={(e) => {
          setValue(e.target.value.slice(0, MAX))
          autosize()
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? 'How can I help you today?'}
        className="block max-h-60 w-full resize-none bg-transparent px-2 pt-2 text-sm leading-relaxed text-pg-text-0 caret-pg-accent-green outline-none placeholder:text-pg-text-mute"
      />
      <div className="mt-1 flex items-center gap-1.5">
        {toolbar}
        <div className="flex-1" />
        {actions}
        <button
          type="button"
          onClick={isBusy ? onStop : submit}
          disabled={isBusy ? !onStop : !value.trim()}
          aria-label={isBusy ? 'Stop' : 'Send'}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30',
            isBusy
              ? 'bg-pg-text-0 text-white hover:bg-black'
              : 'bg-pg-accent-green text-white hover:bg-pg-accent-green-2',
          )}
        >
          {isBusy ? <Square className="h-3.5 w-3.5" fill="currentColor" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

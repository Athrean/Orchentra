'use client'

import { ArrowRight } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../ui/button'
import { cn } from '../../../lib/utils'

interface ComposerProps {
  onSubmit: (value: string) => void
  disabled?: boolean
}

const MAX = 4000

export function Composer({ onSubmit, disabled }: ComposerProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      className={cn(
        'relative rounded-[8px] border border-neutral-800/80 bg-darkest transition-opacity',
        disabled && 'opacity-60',
      )}
    >
      <div className="relative flex flex-col">
        <span className="pointer-events-none absolute left-4 top-5 select-none font-mono text-sm text-neutral-600">
          &gt;
        </span>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX))}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={disabled}
          className="h-15 w-full resize-none border-0 bg-transparent py-5 pl-10 pr-4 text-sm tracking-wider text-light caret-light transition-all duration-200 placeholder:text-sm placeholder:text-neutral-700 focus:h-28 focus:outline-none"
          placeholder="ask anything about your pipelines..."
        />
      </div>
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-x-3 text-xs text-light/40">
          <span className="font-mono">claude-3.7-sonnet</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-light/40">
            {value.length} / {MAX}
          </span>
          <Button variant="exec" size="sm" type="button" onClick={handleSubmit} disabled={disabled || !value.trim()}>
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

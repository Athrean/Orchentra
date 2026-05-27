import * as React from 'react'
import { cn } from '../../../lib/utils'

interface KbdProps {
  children: React.ReactNode
  className?: string
}

/**
 * Single-key visual representation. Used in the shortcut sheet and any inline
 * hint copy ("Press ⌘ /").
 */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-7 h-7 items-center justify-center px-2',
        'bg-pg-surface-1 rounded-[7px] shadow-[0_0_0_1px_rgba(20,20,18,0.08)]',
        'text-sm font-medium text-pg-text-0 tracking-wide',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

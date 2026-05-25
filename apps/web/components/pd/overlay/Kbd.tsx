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
        'bg-dark border border-neutral-800 rounded-[4px]',
        'text-sm font-medium text-light tracking-wide',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

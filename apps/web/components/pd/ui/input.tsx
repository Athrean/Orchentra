import * as React from 'react'
import { cn } from '../../../lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-[4px] border border-[var(--color-pd-border)] bg-[var(--color-pd-bg)] px-3 py-1 text-sm text-[var(--color-pd-text)] shadow-sm outline-none transition-colors',
        'placeholder:text-[var(--color-pd-text-subtle)]',
        'focus-visible:border-[var(--color-pd-primary)] focus-visible:ring-1 focus-visible:ring-[var(--color-pd-primary)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

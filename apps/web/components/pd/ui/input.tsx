import * as React from 'react'
import { cn } from '../../../lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-[8px] bg-pg-surface-0 px-3 py-1 text-sm tracking-wide text-pg-text-0 shadow-[0_0_0_1px_rgba(20,20,18,0.08)] outline-none transition-shadow',
        'placeholder:text-pg-text-mute/60',
        'focus-visible:shadow-[0_0_0_1px_rgba(28,126,84,0.35)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

import * as React from 'react'
import { cn } from '../../../lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-[4px] border border-neutral-800 bg-transparent px-3 py-1 text-sm tracking-wide text-light outline-none transition-colors',
        'placeholder:text-light/40',
        'focus-visible:border-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

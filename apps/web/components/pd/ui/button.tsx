'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[4px] text-sm font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-pd-primary)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-pd-primary)] text-white hover:bg-[var(--color-pd-primary)]/90',
        outline:
          'border border-[var(--color-pd-border)] text-[var(--color-pd-text)] hover:bg-[var(--color-pd-elevated)] hover:border-[var(--color-pd-border-hover)]',
        ghost:
          'text-[var(--color-pd-text-muted)] hover:bg-[var(--color-pd-elevated)] hover:text-[var(--color-pd-text)]',
        destructive: 'bg-[#dc2626] text-white hover:bg-[#b91c1c]',
        link: 'text-[var(--color-pd-primary)] underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {children}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }

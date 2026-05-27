import * as React from 'react'
import { cn } from '../../../lib/utils'

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[14px] bg-white shadow-[0_18px_45px_-34px_rgba(15,15,14,0.5),0_0_0_1px_rgba(20,20,18,0.06)]',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 px-5 pt-4 pb-2', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-xs font-semibold uppercase tracking-wider text-pg-text-0', className)}
      {...props}
    />
  ),
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-pg-text-mute tracking-wide', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('px-5 py-3', className)} {...props} />,
)
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center px-5 py-3', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'

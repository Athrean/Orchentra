import { cn } from '../../lib/utils'

export function Card({
  children,
  className,
  padding = true,
}: {
  children: React.ReactNode
  className?: string
  padding?: boolean
}) {
  return (
    <div
      className={cn(
        'bg-[--color-app-panel] border border-[--color-app-border] rounded-2xl',
        padding && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardSection({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('border-t border-[--color-app-border] px-4 py-3', className)}>{children}</div>
}

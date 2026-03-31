import { cn } from '../../lib/utils'

type Variant = 'brand' | 'amber' | 'blue' | 'purple' | 'emerald' | 'red' | 'muted' | 'default'

const variantStyles: Record<Variant, string> = {
  brand: 'bg-[--color-brand-dim] text-[--color-brand] border border-[--color-brand-border]',
  amber: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  red: 'bg-red-500/10 text-red-400 border border-red-500/20',
  muted: 'bg-white/5 text-[--color-app-text-muted] border border-white/5',
  default: 'bg-white/6 text-[--color-app-text-secondary] border border-white/8',
}

export function Badge({
  children,
  variant = 'default',
  icon,
  className,
}: {
  children: React.ReactNode
  variant?: Variant
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full',
        variantStyles[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

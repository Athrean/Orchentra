import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

type Variant = 'primary' | 'ghost' | 'danger' | 'muted' | 'green'
type Size = 'sm' | 'md' | 'lg'

const variantStyles: Record<Variant, string> = {
  primary: 'bg-white/8 hover:bg-white/12 text-white border border-white/8 hover:border-white/14',
  ghost: 'bg-transparent hover:bg-white/5 text-[--color-app-text-secondary] hover:text-white border border-transparent',
  danger: 'bg-red-500/10 hover:bg-red-500/18 text-red-400 border border-red-500/20 hover:border-red-500/30',
  muted:
    'bg-white/4 hover:bg-white/7 text-[--color-app-text-muted] hover:text-[--color-app-text-secondary] border border-white/4',
  green: 'bg-[--color-green] hover:bg-[--color-green-hover] text-white border border-transparent',
}

const sizeStyles: Record<Size, string> = {
  sm: 'text-[11px] px-2.5 py-1.5 gap-1',
  md: 'text-xs px-3 py-2 gap-1.5',
  lg: 'text-sm px-4 py-2.5 gap-2',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  className,
  onClick,
}: {
  children: React.ReactNode
  variant?: Variant
  size?: Size
  loading?: boolean
  disabled?: boolean
  icon?: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center font-medium rounded-lg transition-colors cursor-pointer',
        variantStyles[variant],
        sizeStyles[size],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : icon}
      {children}
    </button>
  )
}

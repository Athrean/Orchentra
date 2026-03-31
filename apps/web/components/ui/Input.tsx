import { cn } from '../../lib/utils'

export function Input({
  icon,
  trailing,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon?: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <div className="relative">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[--color-app-text-subtle] pointer-events-none">
          {icon}
        </span>
      )}
      <input
        className={cn(
          'w-full bg-[--color-app-deep] border border-[--color-app-border] rounded-xl',
          'text-sm text-[--color-app-text] placeholder:text-[--color-app-text-subtle]',
          'outline-none focus:border-[--color-app-border-hover] transition-colors',
          'py-2',
          icon ? 'pl-8 pr-4' : 'px-4',
          trailing && 'pr-10',
          className,
        )}
        {...props}
      />
      {trailing && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[--color-app-text-subtle]">{trailing}</span>
      )}
    </div>
  )
}

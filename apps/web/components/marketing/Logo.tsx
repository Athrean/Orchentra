import { cn } from '../../lib/utils'

export function Logo({
  size = 28,
  color = 'var(--color-coral)',
  withWordmark = true,
  className,
}: {
  size?: number
  color?: string
  withWordmark?: boolean
  className?: string
}): React.ReactNode {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          backgroundColor: color,
          WebkitMaskImage: 'url(/green-logo.png)',
          maskImage: 'url(/green-logo.png)',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      />
      {withWordmark && (
        <span
          className="text-[20px] tracking-tight"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 500, color }}
        >
          Orchentra
        </span>
      )}
    </span>
  )
}

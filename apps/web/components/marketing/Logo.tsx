import Image from 'next/image'
import { cn } from '../../lib/utils'

const LOGO_ASPECT = 634 / 393

export function Logo({
  height = 32,
  wordmarkColor = 'var(--color-brand)',
  tint,
  withWordmark = true,
  className,
}: {
  height?: number
  wordmarkColor?: string
  tint?: string
  withWordmark?: boolean
  className?: string
}): React.ReactNode {
  const width = Math.round(height * LOGO_ASPECT)
  return (
    <span className={cn('inline-flex items-center', className)}>
      {tint ? (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width,
            height,
            backgroundColor: tint,
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
      ) : (
        <Image src="/green-logo.png" alt="Orchentra" width={width} height={height} priority style={{ height, width }} />
      )}
      {withWordmark && (
        <span
          className="tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            color: wordmarkColor,
            fontSize: Math.round(height * 0.95),
            lineHeight: 1,
            marginLeft: -Math.round(height * 0.15),
          }}
        >
          Orchentra
        </span>
      )}
    </span>
  )
}

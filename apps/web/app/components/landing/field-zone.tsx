import { m } from 'framer-motion'
import { softSpring } from './motion'

type FieldZoneVariant = 'hero' | 'process' | 'spine'

/* Transparent stage the page pixel-field engine paints through; only the
 * caption chips and the centre word are DOM. */
export function FieldZone({ variant }: { variant: FieldZoneVariant }): React.ReactNode {
  return (
    <div className={`field-zone field-zone--${variant}`} data-px-zone={variant} aria-hidden="true">
      {variant === 'hero' ? (
        <>
          <FieldCaption side="left">plan / build / review</FieldCaption>
          <FieldCaption side="right">budget inherited</FieldCaption>
        </>
      ) : null}
      {variant === 'process' ? <FieldWord>RUN THE REPO</FieldWord> : null}
      {variant === 'spine' ? <FieldWord>ONE SPINE</FieldWord> : null}
    </div>
  )
}

function FieldCaption({ side, children }: { side: 'left' | 'right'; children: React.ReactNode }): React.ReactNode {
  return (
    <m.span
      className={`field-caption field-caption--${side}`}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ ...softSpring, delay: 0.32 }}
    >
      {children}
    </m.span>
  )
}

function FieldWord({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <m.span
      className="field-word pixel-type"
      initial={{ opacity: 0, scale: 0.9, x: '-50%', y: '-42%' }}
      whileInView={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ ...softSpring, delay: 0.25 }}
    >
      {children}
    </m.span>
  )
}

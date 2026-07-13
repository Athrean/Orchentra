import { AnimatePresence, animate, m } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { spring } from './motion'

export function HorizontalCarousel({ children, label }: { children: React.ReactNode; label: string }): React.ReactNode {
  const trackRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<ReturnType<typeof animate> | null>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

  function updateEdges(): void {
    const track = trackRef.current
    if (!track) return
    const maxScroll = track.scrollWidth - track.clientWidth
    setEdges({ start: track.scrollLeft <= 4, end: track.scrollLeft >= maxScroll - 4 })
  }

  useEffect(() => {
    updateEdges()
    return () => animationRef.current?.stop()
  }, [])

  function move(direction: -1 | 1): void {
    const track = trackRef.current
    if (!track) return

    animationRef.current?.stop()
    const maxScroll = track.scrollWidth - track.clientWidth
    const distance = Math.max(320, track.clientWidth * 0.82)
    const target = Math.min(maxScroll, Math.max(0, track.scrollLeft + direction * distance))

    animationRef.current = animate(track.scrollLeft, target, {
      type: 'spring',
      stiffness: 145,
      damping: 24,
      mass: 0.75,
      restDelta: 0.5,
      onUpdate: (value) => track.scrollTo({ left: value }),
    })
  }

  return (
    <div className="carousel-shell">
      {!edges.start ? <CarouselArrow direction={-1} label={`Previous ${label}`} onClick={() => move(-1)} /> : null}
      <div
        className="carousel-track"
        ref={trackRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={updateEdges}
      >
        {children}
      </div>
      {!edges.end ? <CarouselArrow direction={1} label={`Next ${label}`} onClick={() => move(1)} /> : null}
    </div>
  )
}

function CarouselArrow({ direction, label, onClick }: { direction: -1 | 1; label: string; onClick: () => void }) {
  return (
    <m.button
      className={`carousel-arrow carousel-arrow--${direction === -1 ? 'previous' : 'next'}`}
      type="button"
      onClick={onClick}
      aria-label={label}
      whileHover={{ scale: 1.08, x: direction * 2 }}
      whileTap={{ scale: 0.92 }}
      transition={spring}
    >
      {direction === -1 ? '←' : '→'}
    </m.button>
  )
}

export function CopyCommand({ command }: { command: string }): React.ReactNode {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    },
    [],
  )

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <m.button
      type="button"
      className="copy-command"
      onClick={copy}
      aria-label="Copy install command"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
    >
      <span className="copy-prompt">{copied ? '✓' : '$'}</span>
      <AnimatePresence mode="wait" initial={false}>
        <m.code
          key={copied ? 'copied' : 'command'}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.16 }}
        >
          {copied ? 'Copied to clipboard' : command}
        </m.code>
      </AnimatePresence>
      <span aria-hidden="true">{copied ? 'done' : 'copy'}</span>
    </m.button>
  )
}

export function Logo({ size, light = false }: { size: number; light?: boolean }): React.ReactNode {
  return <Image src={light ? '/white-logo.svg' : '/black-logo.svg'} alt="" width={size} height={size} priority />
}

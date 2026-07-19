'use client'

import { AnimatePresence, m } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

export function Logo({ size = 26 }: { size?: number }): React.ReactNode {
  return <Image src="/white-logo.svg" alt="" width={size} height={size} priority />
}

export function Brand({ compact = false }: { compact?: boolean }): React.ReactNode {
  return (
    <span className={compact ? 'brand brand--compact' : 'brand'}>
      <Logo size={compact ? 22 : 26} />
      <span>Orchentra</span>
    </span>
  )
}

export function CornerButton({
  href,
  children,
  className = '',
  external = false,
}: {
  href: string
  children: React.ReactNode
  className?: string
  external?: boolean
}): React.ReactNode {
  return (
    <a
      className={`corner-button ${className}`.trim()}
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
    >
      <span>{children}</span>
      <i className="corner corner--tl" aria-hidden="true" />
      <i className="corner corner--tr" aria-hidden="true" />
      <i className="corner corner--bl" aria-hidden="true" />
      <i className="corner corner--br" aria-hidden="true" />
    </a>
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
    <m.button className="copy-command" type="button" onClick={copy} whileTap={{ scale: 0.985 }}>
      <span aria-hidden="true">$</span>
      <AnimatePresence initial={false} mode="wait">
        <m.code
          key={copied ? 'copied' : 'command'}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {copied ? 'Copied to clipboard' : command}
        </m.code>
      </AnimatePresence>
      <strong>{copied ? 'Done' : 'Copy'}</strong>
    </m.button>
  )
}

export function Glyph({ name }: { name: string }): React.ReactNode {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const }

  if (name === 'folder') {
    return (
      <svg viewBox="0 0 24 24" role="presentation">
        <path {...common} d="M3.5 7.5h6l2-2h9v13h-17z" />
      </svg>
    )
  }
  if (name === 'plan') {
    return (
      <svg viewBox="0 0 24 24" role="presentation">
        <path {...common} d="M5 5h14M5 12h9M5 19h6" />
        <path {...common} d="m16 15 3 3-3 3" />
      </svg>
    )
  }
  if (name === 'build') {
    return (
      <svg viewBox="0 0 24 24" role="presentation">
        <path {...common} d="m5 18 8-8M12 5l7 7M15 3l6 6-3 3-6-6zM3 17l4 4" />
      </svg>
    )
  }
  if (name === 'verify' || name === 'gate') {
    return (
      <svg viewBox="0 0 24 24" role="presentation">
        <path {...common} d="M4 12.5 9.5 18 20 6" />
      </svg>
    )
  }
  if (name === 'browser') {
    return (
      <svg viewBox="0 0 24 24" role="presentation">
        <rect {...common} x="3" y="4" width="18" height="16" />
        <path {...common} d="M3 8h18M6 6h.01M9 6h.01" />
      </svg>
    )
  }
  if (name === 'agents') {
    return (
      <svg viewBox="0 0 24 24" role="presentation">
        <circle {...common} cx="12" cy="6" r="2.5" />
        <circle {...common} cx="6" cy="17" r="2.5" />
        <circle {...common} cx="18" cy="17" r="2.5" />
        <path {...common} d="m10.5 8-3 6M13.5 8l3 6M8.5 17h7" />
      </svg>
    )
  }
  if (name === 'model') {
    return (
      <svg viewBox="0 0 24 24" role="presentation">
        <circle {...common} cx="12" cy="12" r="3" />
        <path
          {...common}
          d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
        />
      </svg>
    )
  }
  if (name === 'context') {
    return (
      <svg viewBox="0 0 24 24" role="presentation">
        <circle {...common} cx="12" cy="12" r="7" />
        <path {...common} d="M12 8v4l3 2" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" role="presentation">
      <path {...common} d="M4 7h7v4H4zM13 13h7v4h-7zM11 9h2v6" />
    </svg>
  )
}

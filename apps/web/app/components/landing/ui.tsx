import { AnimatePresence, m } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

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

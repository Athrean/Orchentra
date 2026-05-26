'use client'

import * as React from 'react'
import { Modal } from './Modal'
import { Kbd } from './Kbd'

interface Shortcut {
  keys: string[]
  label: string
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'K'], label: 'Open search' },
  { keys: ['⌘', '/'], label: 'Show keyboard shortcuts' },
  { keys: ['⌘', 'J'], label: 'Toggle workspace composer' },
  { keys: ['⌘', '⇧', 'L'], label: 'Sign out' },
  { keys: ['Esc'], label: 'Close modal / clear input' },
  { keys: ['Enter'], label: 'Send message' },
  { keys: ['⇧', 'Enter'], label: 'New line in composer' },
]

interface ShortcutSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShortcutSheet({ open, onOpenChange }: ShortcutSheetProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" maxWidth="md">
      <ul>
        {SHORTCUTS.map((s, i) => (
          <li
            key={i}
            className={
              'flex items-center justify-between py-2.5 ' +
              (i < SHORTCUTS.length - 1 ? 'border-b border-neutral-800' : '')
            }
          >
            <span className="text-sm text-light/80 tracking-wide">{s.label}</span>
            <span className="flex items-center gap-1">
              {s.keys.map((k, j) => (
                <Kbd key={j}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

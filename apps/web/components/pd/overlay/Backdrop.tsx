'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

interface BackdropProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

/**
 * Hand-rolled portal overlay. Modal/Drawer prefer Radix Dialog for focus trap +
 * keyboard handling; Backdrop is exported as the simpler fallback for consumers
 * that need a custom floating surface.
 */
export function Backdrop({ open, onClose, children }: BackdropProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!open || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 bg-dark/70" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full items-center justify-center px-6">
        {children}
      </div>
    </div>,
    document.body,
  )
}

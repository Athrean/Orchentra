'use client'

import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
}

/**
 * Right-anchored slide-in panel. 24rem wide, full-height. Uses Radix Dialog
 * for focus trap + Esc handling; visual chrome matches the workspace surface
 * (8px outer radius, neutral-800 hairline, shadow-md).
 */
export function Drawer({ open, onOpenChange, title, description, children }: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-dark/70" />
        <Dialog.Content
          className={cn(
            'fixed top-0 right-0 z-50 flex h-screen w-[24rem] flex-col',
            'bg-darkest border-l border-neutral-800 rounded-[8px] rounded-r-none',
            'px-6 py-5 shadow-md',
          )}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <Dialog.Title className="text-base font-semibold text-light tracking-wider">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm text-light/60 tracking-wide">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close aria-label="Close" className="text-light/40 hover:text-light transition-colors">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

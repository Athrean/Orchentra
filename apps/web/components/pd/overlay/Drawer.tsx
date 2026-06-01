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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed top-0 right-0 z-50 flex h-screen w-[24rem] flex-col',
            'rounded-[14px] rounded-r-none bg-pg-surface-card px-6 py-5 text-pg-text-0 shadow-[0_28px_70px_-32px_rgba(15,15,14,0.55),0_0_0_1px_rgba(20,20,18,0.08)]',
          )}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <Dialog.Title className="text-base font-semibold text-pg-text-0 tracking-tight">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm text-pg-text-mute tracking-wide">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close aria-label="Close" className="text-pg-text-mute transition-colors hover:text-pg-text-0">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

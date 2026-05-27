'use client'

import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  maxWidth?: 'md' | 'lg' | 'xl'
}

export function Modal({ open, onOpenChange, title, description, children, maxWidth = 'md' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-full rounded-[14px] bg-white px-6 py-5 text-pg-text-0 shadow-[0_28px_70px_-32px_rgba(15,15,14,0.55),0_0_0_1px_rgba(20,20,18,0.08)]',
            maxWidth === 'md' && 'max-w-md',
            maxWidth === 'lg' && 'max-w-lg',
            maxWidth === 'xl' && 'max-w-2xl',
          )}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <Dialog.Title className="text-xl font-semibold text-pg-text-0 tracking-tight">{title}</Dialog.Title>
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
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

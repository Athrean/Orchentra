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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-dark/70" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-full bg-darkest border border-neutral-800 rounded-[8px] px-6 py-5 shadow-md',
            maxWidth === 'md' && 'max-w-md',
            maxWidth === 'lg' && 'max-w-lg',
            maxWidth === 'xl' && 'max-w-2xl',
          )}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <Dialog.Title className="text-xl font-semibold text-light tracking-wider">{title}</Dialog.Title>
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
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

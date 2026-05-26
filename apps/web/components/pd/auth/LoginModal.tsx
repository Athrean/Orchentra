'use client'

import * as React from 'react'
import Image from 'next/image'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { LoginForm } from './LoginForm'

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  next?: string
}

export function LoginModal({ open, onOpenChange, next }: LoginModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <Image src="/mascot.svg" alt="Orchentra" width={36} height={36} className="opacity-90 [filter:invert(1)]" />
          <DialogTitle className="text-xl font-semibold tracking-tight text-light">Welcome to Orchentra</DialogTitle>
          <DialogDescription className="text-sm text-light/70">
            Sign in to manage your repos, CI, and operations.
          </DialogDescription>
        </div>
        <LoginForm next={next} chromeless />
      </DialogContent>
    </Dialog>
  )
}

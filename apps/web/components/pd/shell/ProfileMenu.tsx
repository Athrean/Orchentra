'use client'

import * as React from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { LogOut, Settings, User } from 'lucide-react'
import { createClient } from '../../../lib/supabase/client'
import { cn } from '../../../lib/utils'

interface Props {
  email: string | null | undefined
  fullName: string | null | undefined
  avatarUrl: string | null | undefined
}

export function ProfileMenu({ email, fullName, avatarUrl }: Props) {
  const router = useRouter()
  const supabase = React.useMemo(() => createClient(), [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const label = fullName || email || 'Account'
  const initial = (label[0] ?? 'O').toUpperCase()

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          'flex h-8 items-center gap-2 rounded-[4px] border border-neutral-800 bg-darker px-2 text-xs tracking-wide text-light/70 outline-none transition-colors',
          'hover:border-neutral-700 hover:text-light',
          'data-[state=open]:border-neutral-700',
        )}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
            {initial}
          </span>
        )}
        <span className="max-w-[140px] truncate">{label}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            'min-w-44 rounded-[4px] border border-neutral-800 bg-darker p-1 shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
          )}
        >
          <DropdownMenu.Item asChild>
            <Link
              href="/account"
              className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2 py-1.5 text-xs text-light/70 outline-none data-[highlighted]:bg-dark data-[highlighted]:text-light"
            >
              <User className="h-3.5 w-3.5" />
              Account
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/account/devices"
              className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2 py-1.5 text-xs text-light/70 outline-none data-[highlighted]:bg-dark data-[highlighted]:text-light"
            >
              <Settings className="h-3.5 w-3.5" />
              CLI devices
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[rgb(38 38 38)]" />
          <DropdownMenu.Item
            onSelect={signOut}
            className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2 py-1.5 text-xs text-light/70 outline-none data-[highlighted]:bg-dark data-[highlighted]:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Cpu, LogOut, Settings } from 'lucide-react'
import { createClient } from '../../../lib/supabase/client'

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

  const initial = ((email ?? fullName ?? 'O')[0] ?? 'O').toUpperCase()

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Account menu"
        className="h-7 w-7 cursor-pointer overflow-hidden rounded-full outline-none transition hover:ring-2 hover:ring-primary"
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={28}
            height={28}
            unoptimized
            className="h-7 w-7 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-dark text-xs font-semibold text-light/70">
            {initial}
          </span>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="w-[9rem] overflow-hidden rounded-[4px] border border-neutral-800 bg-dark shadow-md"
        >
          <DropdownMenu.Item asChild>
            <Link
              href="/account"
              className="flex cursor-pointer items-center justify-between px-4 py-[11px] text-xs tracking-wide text-light outline-none hover:bg-darker"
            >
              Account
              <Settings size={12} />
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/account/devices"
              className="flex cursor-pointer items-center justify-between px-4 py-[11px] text-xs tracking-wide text-light outline-none hover:bg-darker"
            >
              CLI devices
              <Cpu size={12} />
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="border-b border-neutral-800" />
          <DropdownMenu.Item
            onSelect={signOut}
            className="flex cursor-pointer items-center justify-between px-4 py-[11px] text-xs tracking-wide text-red-500 outline-none hover:bg-darker"
          >
            Sign out
            <LogOut size={12} />
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

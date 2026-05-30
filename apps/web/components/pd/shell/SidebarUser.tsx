'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { LogOut, Settings, UsersRound } from 'lucide-react'
import { createClient } from '../../../lib/supabase/client'
import { cn } from '../../../lib/utils'

interface Props {
  email: string | null | undefined
  fullName: string | null | undefined
  avatarUrl: string | null | undefined
  collapsed?: boolean
  onCreateTeam?: () => void
}

/** Footer profile row — opens an account dropdown (sidebar-03 NavUser pattern). */
export function SidebarUser({ email, fullName, avatarUrl, collapsed, onCreateTeam }: Props) {
  const router = useRouter()
  const supabase = React.useMemo(() => createClient(), [])
  const display = fullName ?? email ?? 'Signed in'
  const initial = ((email ?? fullName ?? 'O')[0] ?? 'O').toUpperCase()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const avatar = avatarUrl ? (
    <Image
      src={avatarUrl}
      alt=""
      width={28}
      height={28}
      unoptimized
      className="h-7 w-7 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#8a321f] text-[11px] font-semibold text-white">
      {initial}
    </span>
  )

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className={cn(
            'group relative flex rounded-[10px] outline-none transition-colors hover:bg-pg-surface-1 focus-visible:bg-pg-surface-1',
            collapsed ? 'h-9 w-9 items-center justify-center' : 'w-full items-center gap-2.5 px-2 py-2 text-left',
          )}
        >
          {avatar}
          {collapsed ? (
            <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-60 -translate-y-1/2 whitespace-nowrap rounded-[7px] bg-[#111111] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity delay-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:hidden">
              Account
            </span>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-pg-text-0">{display}</span>
              {email ? <span className="block truncate text-xs text-pg-text-mute">{email}</span> : null}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          side="right"
          sideOffset={10}
          className="z-50 w-[212px] rounded-[12px] bg-pg-surface-card p-2 text-pg-text-0 shadow-[0_18px_45px_-24px_rgba(15,15,14,0.45),0_0_0_1px_rgba(20,20,18,0.08)]"
        >
          <div className="flex items-center gap-2.5 px-2 pb-3 pt-1">
            {avatar}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{display}</div>
              {email ? <div className="truncate text-xs text-pg-text-mute">{email}</div> : null}
            </div>
          </div>
          <DropdownMenu.Item
            onSelect={onCreateTeam}
            className="flex cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm text-pg-text-0 outline-none transition-colors hover:bg-pg-surface-1"
          >
            <UsersRound className="h-4 w-4 text-pg-text-mute" />
            Create team
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="flex cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm text-pg-text-0 outline-none transition-colors hover:bg-pg-surface-1"
            >
              <Settings className="h-4 w-4 text-pg-text-mute" />
              Profile settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={signOut}
            className="flex cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm text-pg-text-0 outline-none transition-colors hover:bg-pg-surface-1"
          >
            <LogOut className="h-4 w-4 text-pg-text-mute" />
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HelpCircle, LayoutDashboard, MessageSquare, Settings } from 'lucide-react'
import { PRODUCT_ROUTES } from '../../../lib/nav'
import { cn } from '../../../lib/utils'
import { UserPill } from './UserPill'

const ICONS = { LayoutDashboard, MessageSquare, Settings, HelpCircle } as const

interface Props {
  email: string | null | undefined
  fullName: string | null | undefined
  avatarUrl: string | null | undefined
}

export function AppSidebar({ email, fullName, avatarUrl }: Props) {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-neutral-800 bg-darker">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-5 py-4">
        <div className="h-5 w-5 rounded-[4px] bg-primary" />
        <span className="text-[15px] font-semibold tracking-[0.18rem] text-[#C3C3C3]">ORCHENTRA</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-3">
        {PRODUCT_ROUTES.map(({ href, label, icon }) => {
          const Icon = ICONS[icon]
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-[4px] px-3 py-2 text-sm tracking-wide transition-colors',
                active ? 'bg-dark text-light' : 'text-light/70 hover:bg-dark hover:text-light',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      <UserPill email={email} fullName={fullName} avatarUrl={avatarUrl} />
    </aside>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, MessageSquare, Settings } from 'lucide-react'
import { PRODUCT_ROUTES } from '../../../lib/nav'
import { cn } from '../../../lib/utils'

const ICONS = { LayoutDashboard, MessageSquare, Settings } as const

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-neutral-800 bg-darker">
      <div className="flex h-14 items-center px-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-[3px] bg-primary" />
          <span className="text-sm font-semibold tracking-wide text-light">orchentra</span>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
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
      <div className="border-t border-neutral-800 px-5 py-3 text-[10px] uppercase tracking-wider text-light/40">
        v0.1
      </div>
    </aside>
  )
}

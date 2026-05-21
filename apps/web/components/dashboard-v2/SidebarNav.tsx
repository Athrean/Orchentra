'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, Layers, Settings } from 'lucide-react'

const ITEMS = [
  { href: '/dashboard', label: 'executions', icon: Activity },
  { href: '/dashboard/diff', label: 'diff', icon: Layers },
  { href: '/dashboard/settings', label: 'settings', icon: Settings },
]

export function SidebarNav({ orgName }: { orgName: string }) {
  const pathname = usePathname()
  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] font-mono">
      <div className="border-b border-[var(--color-pg-hairline)] px-4 py-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-block h-5 w-5 bg-[var(--color-pg-accent-coral)]" aria-hidden />
          <span className="truncate text-[var(--color-pg-text-0)]">{orgName || 'orchentra'}</span>
        </div>
      </div>
      <nav className="flex-1 py-2">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                active
                  ? 'bg-[var(--color-pg-surface-2)] text-[var(--color-pg-text-0)]'
                  : 'text-[var(--color-pg-text-mute)] hover:text-[var(--color-pg-text-0)]'
              }`}
            >
              {active && <span className="absolute left-0 top-0 h-full w-[2px] bg-[var(--color-pg-accent-coral)]" />}
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

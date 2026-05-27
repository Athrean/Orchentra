'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '../../../lib/utils'
import { settingsSections } from './settings-sections'

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {settingsSections.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex min-w-[150px] items-center gap-2 rounded-[8px] px-3 py-2 text-sm transition lg:min-w-0',
              active
                ? 'bg-pg-text-0 text-white shadow-sm'
                : 'text-pg-text-mute hover:bg-white hover:text-pg-text-0 hover:shadow-[0_0_0_1px_rgba(20,20,18,0.06)]',
            )}
          >
            <Icon
              className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-pg-text-mute group-hover:text-pg-text-0')}
            />
            <span className="truncate font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

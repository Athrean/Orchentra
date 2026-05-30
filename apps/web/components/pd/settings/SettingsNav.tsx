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
              'group flex min-w-[150px] items-center gap-2 rounded-[8px] px-2.5 text-sm transition-colors lg:min-w-0',
              'h-8 text-pg-text-mute hover:bg-pg-surface-1 hover:text-pg-text-0',
              active && 'bg-pg-surface-1 text-pg-text-0',
            )}
          >
            <Icon
              className={cn(
                'h-[18px] w-[18px] shrink-0',
                active ? 'text-pg-text-0' : 'text-pg-text-mute group-hover:text-pg-text-0',
              )}
              strokeWidth={1.75}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

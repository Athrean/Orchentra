'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HelpCircle, LayoutDashboard, MessageSquare, Settings } from 'lucide-react'
import { PRODUCT_ROUTES } from '../../../lib/nav'
import { cn } from '../../../lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

const ICONS = { LayoutDashboard, MessageSquare, Settings, HelpCircle } as const

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="h-full min-w-14 bg-darker border-r border-neutral-800 flex flex-col">
      <TooltipProvider delayDuration={300}>
        <nav className="flex flex-col gap-y-7 items-center py-5">
          {PRODUCT_ROUTES.map(({ href, label, icon }) => {
            const Icon = ICONS[icon]
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Tooltip key={href}>
                <TooltipTrigger asChild>
                  <Link
                    href={href}
                    aria-label={label}
                    className={cn(
                      'cursor-pointer transition-colors',
                      active ? 'text-primary/70' : 'text-light/70 hover:text-primary/70',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </TooltipProvider>
    </aside>
  )
}

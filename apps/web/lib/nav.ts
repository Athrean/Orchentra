/**
 * Single source of truth for product-shell routes.
 * Consumed by the sidebar (render) and middleware (auth gate).
 * Add a new route to a group here when shipping a new shell page —
 * the sidebar renders it and `PROTECTED_PREFIXES` auto-gates it.
 */
export type NavIcon = 'Telescope' | 'Activity' | 'CalendarClock' | 'Workflow' | 'Settings' | 'HelpCircle'

export interface NavItem {
  href: string
  label: string
  icon: NavIcon
}

export interface NavGroup {
  /** Optional section caption. Omitted groups render as a bare cluster. */
  label?: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { href: '/dashboard', label: 'Investigate', icon: 'Telescope' },
      { href: '/runs', label: 'Runs & activity', icon: 'Activity' },
      { href: '/crons', label: 'Schedules', icon: 'CalendarClock' },
      { href: '/graph', label: 'Graph', icon: 'Workflow' },
    ],
  },
  {
    items: [
      { href: '/settings', label: 'Settings', icon: 'Settings' },
      { href: '/help', label: 'Help', icon: 'HelpCircle' },
    ],
  },
]

const NAV_HREFS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))

/** Workspace is reachable via the Investigate hero, not the rail — still gated. */
export const PROTECTED_PREFIXES = [...NAV_HREFS, '/workspace', '/onboarding', '/account']
export const AUTH_PAGES = ['/login', '/signup'] as const

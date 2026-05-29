/**
 * Single source of truth for product-shell routes.
 * Consumed by the sidebar (render) and middleware (auth gate).
 * Add a new route to a group here when shipping a new shell page —
 * the sidebar renders it and `PROTECTED_PREFIXES` auto-gates it.
 */
export type NavIcon =
  | 'Telescope'
  | 'Activity'
  | 'BarChart3'
  | 'Brain'
  | 'CalendarClock'
  | 'Workflow'
  | 'Settings'
  | 'HelpCircle'

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
      { href: '/investigate', label: 'Investigate', icon: 'Telescope' },
      { href: '/traces', label: 'Traces', icon: 'Activity' },
      { href: '/usage', label: 'Usage', icon: 'BarChart3' },
      { href: '/memory', label: 'Memory', icon: 'Brain' },
      { href: '/evals', label: 'Evals', icon: 'CalendarClock' },
      { href: '/detections', label: 'Detections', icon: 'Workflow' },
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

/** Legacy route names stay gated while their pages redirect to the sidebar URLs. */
export const PROTECTED_PREFIXES = [
  ...NAV_HREFS,
  '/investigate',
  '/triage',
  '/dashboard',
  '/workspace',
  '/runs',
  '/graph',
  '/crons',
  '/onboarding',
  '/account',
]
export const AUTH_PAGES = ['/login', '/signup'] as const

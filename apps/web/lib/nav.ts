/**
 * Single source of truth for product-shell routes.
 * Consumed by the sidebar (render) and middleware (auth gate).
 * Add a new route here when shipping a new shell page — both surfaces pick it up.
 */
export const PRODUCT_ROUTES = [
  { href: '/dashboard', label: 'Overview', icon: 'LayoutDashboard' as const },
  { href: '/workspace', label: 'Workspace', icon: 'MessageSquare' as const },
  { href: '/account', label: 'Account', icon: 'Settings' as const },
] as const

export const PROTECTED_PREFIXES = PRODUCT_ROUTES.map((r) => r.href)
export const AUTH_PAGES = ['/login', '/signup'] as const

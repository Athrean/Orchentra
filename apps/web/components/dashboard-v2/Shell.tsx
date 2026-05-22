import type { ReactNode } from 'react'
import { SidebarNav } from './SidebarNav'

export function Shell({ orgName, children }: { orgName: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--color-pg-surface-0)] text-[var(--color-pg-text-0)]">
      <SidebarNav orgName={orgName} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  )
}

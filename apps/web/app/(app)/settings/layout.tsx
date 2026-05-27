import type { ReactNode } from 'react'
import { SettingsNav } from '../../../components/pd/settings/SettingsNav'

export const metadata = { title: 'Settings · Orchentra' }

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-12 pt-8 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-pg-text-0">Settings</h1>
        <p className="mt-1 text-sm text-pg-text-mute">
          Manage your profile, providers, alerts, keys, integrations, and notifications.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}

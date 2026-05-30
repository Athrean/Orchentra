import type { ReactNode } from 'react'

interface SettingsSectionProps {
  title: string
  description: string
  children?: ReactNode
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="flex flex-col gap-5">
      <header>
        <h2 className="text-xl font-semibold tracking-tight text-pg-text-0">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-pg-text-mute">{description}</p>
      </header>
      {children ?? (
        <div className="rounded-[8px] border border-dashed border-pg-hairline bg-pg-surface-card/70 px-5 py-8 text-sm text-pg-text-mute">
          This section is ready for its slice implementation.
        </div>
      )}
    </section>
  )
}

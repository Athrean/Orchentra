import type { ComponentType, ReactNode } from 'react'

interface Props {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  children?: ReactNode
}

/** Clean placeholder surface for shipped-soon shell features. */
export function FeatureLanding({ icon: Icon, title, description, children }: Props) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-6 py-16">
      <div className="surface flex w-full max-w-md flex-col items-center gap-5 p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-pg-accent-green/10 text-pg-accent-green">
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-pg-text-0">{title}</h1>
          <p className="text-sm leading-relaxed text-pg-text-mute">{description}</p>
        </div>
        <span className="inset-chip px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-pg-text-mute">
          Coming soon
        </span>
        {children}
      </div>
    </div>
  )
}

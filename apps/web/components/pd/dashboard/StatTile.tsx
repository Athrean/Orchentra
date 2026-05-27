import type { ComponentType, ReactNode } from 'react'
import { cn } from '../../../lib/utils'

interface StatTileProps {
  title: string
  value: string
  delta?: { dir: 'up' | 'down'; pct: number }
  filter?: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
  className?: string
}

export function StatTile({ title, value, delta, filter, icon: Icon, children, className }: StatTileProps) {
  return (
    <div className={cn('surface flex min-h-[260px] flex-col gap-4 p-5', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-pg-text-mute" />
          <span className="text-sm font-medium tracking-wide text-pg-text-mute">{title}</span>
        </div>
        {filter ? (
          <button
            type="button"
            className="inset-chip cursor-pointer px-2.5 py-1 text-xs text-pg-text-mute transition-colors hover:text-pg-text-0"
          >
            {filter}
          </button>
        ) : null}
      </div>
      <div className="flex items-baseline">
        <span className="text-3xl font-semibold tracking-tight text-pg-text-0">{value}</span>
        {delta ? (
          <span
            className={cn(
              'ml-2 rounded-[3px] px-1.5 py-0.5 text-xs',
              delta.dir === 'up' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-600',
            )}
          >
            {delta.dir === 'up' ? '+' : '-'}
            {delta.pct}%
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

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
    <div
      className={cn(
        'flex min-h-[260px] flex-col gap-4 rounded-[8px] border border-neutral-800 bg-darker p-5',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-light/60" />
          <span className="text-sm font-medium tracking-wide text-light/80">{title}</span>
        </div>
        {filter ? (
          <button
            type="button"
            className="cursor-pointer rounded-[4px] border border-neutral-800 px-2 py-0.5 text-xs text-light/60 transition-colors hover:text-light"
          >
            {filter}
          </button>
        ) : null}
      </div>
      <div className="flex items-baseline">
        <span className="text-3xl font-semibold tracking-tight text-light">{value}</span>
        {delta ? (
          <span
            className={cn(
              'ml-2 rounded-[3px] px-1.5 py-0.5 text-xs',
              delta.dir === 'up' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400',
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

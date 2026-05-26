'use client'

import { cn } from '../../../lib/utils'

interface StepIndicatorProps<T extends string> {
  steps: ReadonlyArray<{ id: T; label: string }>
  current: T
}

export function StepIndicator<T extends string>({ steps, current }: StepIndicatorProps<T>) {
  const currentIdx = steps.findIndex((s) => s.id === current)

  return (
    <nav aria-label="Onboarding progress" className="flex items-center gap-3">
      {steps.map((s, i) => {
        const reached = i <= currentIdx
        const isCurrent = i === currentIdx
        return (
          <div key={s.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium transition-colors',
                  isCurrent
                    ? 'bg-[var(--color-pg-accent-green-2)] text-white'
                    : reached
                      ? 'bg-[var(--color-pg-accent-green)] text-white'
                      : 'bg-white/10 text-light/60',
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  'text-xs font-medium tracking-wide transition-colors',
                  isCurrent ? 'text-light' : reached ? 'text-light/80' : 'text-light/40',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  'h-px w-8 transition-colors',
                  i < currentIdx ? 'bg-[var(--color-pg-accent-green-2)]' : 'bg-white/10',
                )}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}

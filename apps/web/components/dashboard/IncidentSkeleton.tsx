'use client'

import { cn } from '../../lib/utils'

export function SkeletonPulse({ className }: { className?: string }) {
  return <div className={cn('rounded bg-white/6 animate-pulse', className)} />
}

export function IncidentsSkeleton() {
  return (
    <>
      <div className="px-4 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--color-app-border)' }}>
        <SkeletonPulse className="h-3 w-32" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-full px-4 py-3.5 border-b" style={{ borderBottomColor: 'var(--color-app-border)' }}>
            <div className="flex items-start gap-3">
              <SkeletonPulse className="w-3.5 h-3.5 rounded-full mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <SkeletonPulse className="h-4 w-48" />
                  <SkeletonPulse className="h-5 w-20 rounded-full shrink-0" />
                </div>
                <div className="flex items-center gap-1.5">
                  <SkeletonPulse className="h-3 w-24" />
                  <SkeletonPulse className="h-3 w-32" />
                </div>
                <SkeletonPulse className="h-3 w-64" />
                <div className="flex items-center gap-3">
                  <SkeletonPulse className="h-2.5 w-16" />
                  <SkeletonPulse className="h-2.5 w-14" />
                  <SkeletonPulse className="h-2.5 w-12 ml-auto" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

import { CheckCircle2, Circle, CircleDotDashed, ListChecks, XCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { StageItem } from './types'

interface StagePanelProps {
  stages: StageItem[]
}

export function StagePanel({ stages }: StagePanelProps) {
  return (
    <div className="mx-auto my-4 w-[80%] rounded-[4px] border border-neutral-800 bg-linear-to-br from-[#0d0e0e] via-[#111212] to-[#0d0e0e] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-light/70">
        <ListChecks className="h-3 w-3" />
        Execution strategy
      </div>
      <ol className="space-y-1.5">
        {stages.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            {s.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
            {s.status === 'active' && (
              <CircleDotDashed className="h-3.5 w-3.5 animate-spin text-primary [animation-duration:3s]" />
            )}
            {s.status === 'pending' && <Circle className="h-3.5 w-3.5 text-neutral-700" />}
            {s.status === 'failed' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
            <span
              className={cn(
                s.status === 'done' && 'text-light/80',
                s.status === 'active' && 'text-light',
                (s.status === 'pending' || s.status === 'failed') && 'text-light/40',
              )}
            >
              {s.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

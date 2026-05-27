import { CheckCircle2, Circle, CircleDotDashed, ListChecks, XCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { StageItem } from './types'

interface StagePanelProps {
  stages: StageItem[]
}

export function StagePanel({ stages }: StagePanelProps) {
  return (
    <div className="mx-auto my-4 w-[80%] rounded-[12px] border border-pg-hairline bg-white p-3 shadow-[0_1px_2px_0_rgba(20,20,19,0.04)]">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-pg-text-mute">
        <ListChecks className="h-3 w-3" />
        Execution strategy
      </div>
      <ol className="space-y-1.5">
        {stages.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            {s.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            {s.status === 'active' && (
              <CircleDotDashed className="h-3.5 w-3.5 animate-spin text-pg-accent-green [animation-duration:3s]" />
            )}
            {s.status === 'pending' && <Circle className="h-3.5 w-3.5 text-pg-text-mute/50" />}
            {s.status === 'failed' && <XCircle className="h-3.5 w-3.5 text-red-600" />}
            <span
              className={cn(
                s.status === 'done' && 'text-pg-text-0',
                s.status === 'active' && 'text-pg-text-0',
                (s.status === 'pending' || s.status === 'failed') && 'text-pg-text-mute',
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

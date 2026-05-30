import type { ComponentType } from 'react'
import { Lock, Plug } from 'lucide-react'

interface ConnectCardProps {
  icon?: ComponentType<{ className?: string }>
  title: string
  /** Why this is not showing data — a missing integration or a missing permission. */
  reason: string
  /** GitHub App permission this card needs, e.g. "administration: read". Shown as a hint. */
  requiredPermission?: string
  /** External product this card needs, e.g. "SonarQube". Switches the icon/label to integration mode. */
  integrationName?: string
}

/**
 * Honest stand-in for a card whose data source is unreachable — a GitHub
 * permission the App was not granted, or an external integration that is not
 * connected. Renders ZERO numbers so an unauthorized/disconnected source can
 * never be misread as "0 problems".
 */
export function ConnectCard({ icon, title, reason, requiredPermission, integrationName }: ConnectCardProps) {
  const Icon = icon ?? (integrationName ? Plug : Lock)
  return (
    <div className="surface flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-pg-surface-1 text-pg-text-mute">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-medium text-pg-text-0">{title}</h3>
        <span className="inset-chip ml-auto px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-pg-text-mute">
          {integrationName ? 'Not connected' : 'Not authorized'}
        </span>
      </div>
      <p className="text-sm leading-6 text-pg-text-mute">{reason}</p>
      {requiredPermission && (
        <p className="text-xs text-pg-text-mute/80">
          Needs GitHub App permission <span className="font-mono text-pg-text-0">{requiredPermission}</span>.
        </p>
      )}
      {integrationName && (
        <p className="text-xs text-pg-text-mute/80">
          Connect <span className="text-pg-text-0">{integrationName}</span> to enable this signal.
        </p>
      )}
    </div>
  )
}

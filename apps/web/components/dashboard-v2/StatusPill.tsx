const COLORS: Record<string, string> = {
  resolved: 'var(--color-status-resolved)',
  investigating: 'var(--color-status-investigating)',
  fixing: 'var(--color-status-fixing)',
  brief_ready: 'var(--color-status-info)',
  error: 'var(--color-status-error)',
  escalated: 'var(--color-status-error)',
}

export function StatusPill({ status }: { status: string }) {
  const color = COLORS[status] ?? 'var(--color-pg-text-mute)'
  return (
    <span
      className="inline-flex items-center gap-1.5 border border-[var(--color-pg-hairline)] px-2 py-[2px] text-[10px] uppercase tracking-wider text-[var(--color-pg-text-mute)]"
      style={{ borderColor: color }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {status}
    </span>
  )
}

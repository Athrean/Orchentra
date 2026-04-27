import { cn } from '../../lib/utils'

export interface CodeLine {
  text: string
  tone?: 'default' | 'muted' | 'coral' | 'amber' | 'teal'
  prefix?: string
}

export function CodeWindow({
  title = 'orchentra · investigation',
  lines,
  className,
}: {
  title?: string
  lines: CodeLine[]
  className?: string
}): React.ReactNode {
  const toneClass: Record<NonNullable<CodeLine['tone']>, string> = {
    default: 'mk-text-on-dark',
    muted: 'mk-text-on-dark-soft',
    coral: 'mk-text-coral',
    amber: 'text-[var(--color-accent-amber)]',
    teal: 'text-[var(--color-accent-teal)]',
  }
  return (
    <div className={cn('mk-surface-dark overflow-hidden rounded-xl', className)}>
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <span className="block h-3 w-3 rounded-full bg-[#ff6155]" />
        <span className="block h-3 w-3 rounded-full bg-[#ffbe2e]" />
        <span className="block h-3 w-3 rounded-full bg-[#36cd4b]" />
        <span className="ml-3 mk-mono text-[12px] mk-text-on-dark-soft">{title}</span>
      </div>
      <div className="mk-surface-dark-soft mk-mono px-5 py-5 text-[13px] leading-[1.7]">
        {lines.map((line, idx) => (
          <div key={idx} className="flex gap-3">
            {line.prefix !== undefined && <span className="mk-text-on-dark-soft select-none">{line.prefix}</span>}
            <span className={toneClass[line.tone ?? 'default']}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

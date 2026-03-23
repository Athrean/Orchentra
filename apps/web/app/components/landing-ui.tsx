export function SectionHeading({ label, title }: { label: string; title: React.ReactNode }): React.ReactNode {
  return (
    <div className="text-center">
      <span className="inline-block font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-accent">
        {label}
      </span>
      <h2 className="mt-4 font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-text-primary">
        {title}
      </h2>
    </div>
  )
}

export function Divider(): null {
  return null
}

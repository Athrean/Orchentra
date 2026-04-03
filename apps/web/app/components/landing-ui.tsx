export function SectionHeading({
  label,
  title,
  icon,
}: {
  label?: string
  title: React.ReactNode
  icon?: React.ReactNode
}): React.ReactNode {
  return (
    <div className="text-center">
      {icon && <div className="mb-6 flex justify-center text-text-primary">{icon}</div>}
      {label && (
        <span className="inline-block font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-text-secondary">
          {label}
        </span>
      )}
      <h2 className="mt-3 font-serif text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.15] tracking-tight text-text-primary">
        {title}
      </h2>
    </div>
  )
}

export function Divider(): null {
  return null
}

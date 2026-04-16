export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="text-[10px] font-semibold tracking-widest uppercase mb-2"
        style={{ color: 'var(--color-app-text-subtle)' }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

export function MetaCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      className="rounded-lg p-2.5 border"
      style={{
        background: 'var(--color-app-deep)',
        borderColor: 'var(--color-app-border)',
      }}
    >
      <div className="text-[10px] mb-0.5" style={{ color: 'var(--color-app-text-subtle)' }}>
        {label}
      </div>
      <div
        className="text-xs"
        style={{
          color: 'var(--color-app-text-secondary)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  )
}

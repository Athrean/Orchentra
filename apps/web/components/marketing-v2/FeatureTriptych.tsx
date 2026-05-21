// apps/web/components/marketing-v2/FeatureTriptych.tsx
import type { ReactNode } from 'react'

interface Feature {
  title: string
  body: string
  icon: ReactNode
}

const FEATURES: Feature[] = [
  {
    title: 'Operations',
    body: 'Typed, schema-validated units of work. One registry behind both the CLI and the MCP server.',
    icon: <IconOps />,
  },
  {
    title: 'MCP',
    body: 'Exposed to Claude Desktop, Cursor, and Windsurf via stdio. Trust-boundary enforcement lives in the runtime.',
    icon: <IconMcp />,
  },
  {
    title: 'Graph',
    body: 'Every execution recorded as nodes. `orchentra why <nodeId>` audits decisions against existing data.',
    icon: <IconGraph />,
  },
]

export function FeatureTriptych() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid grid-cols-1 md:grid-cols-3">
        {FEATURES.map((f, i) => (
          <div key={f.title} className={`px-6 py-8 ${i > 0 ? 'md:border-l border-[var(--color-pg-hairline)]' : ''}`}>
            <div className="text-[var(--color-pg-accent-green)]">{f.icon}</div>
            <h3 className="mt-4 text-base font-semibold text-[var(--color-pg-text-0)]">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-pg-text-mute)]">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function IconOps() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}
function IconMcp() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="12" cy="12" r="3" />
      <circle cx="4" cy="6" r="2" />
      <circle cx="4" cy="18" r="2" />
      <circle cx="20" cy="6" r="2" />
      <circle cx="20" cy="18" r="2" />
      <path d="M 6 6 L 9 11 M 6 18 L 9 13 M 18 6 L 15 11 M 18 18 L 15 13" />
    </svg>
  )
}
function IconGraph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="5" cy="6" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M 7 6 L 10 11 M 14 11 L 17 6 M 14 13 L 17 18 M 7 18 L 10 13" />
    </svg>
  )
}

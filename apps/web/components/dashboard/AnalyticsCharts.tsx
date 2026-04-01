'use client'

/**
 * Lightweight SVG chart primitives for the analytics dashboard.
 * No external chart library required — keeps the bundle lean.
 */

// ── Sparkline ──────────────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[]
  /** Width of the SVG viewport (default 200). */
  width?: number
  /** Height of the SVG viewport (default 40). */
  height?: number
  /** Stroke colour (default brand red). */
  color?: string
  /** Fill the area under the line. */
  fill?: boolean
}

export function Sparkline({
  data,
  width = 200,
  height = 40,
  color = 'var(--color-brand)',
  fill = true,
}: SparklineProps): React.ReactElement {
  if (data.length === 0) return <svg width={width} height={height} />

  const max = Math.max(...data, 0.001) // avoid div-by-zero
  const min = 0

  const xs = data.map((_, i) => (i / Math.max(data.length - 1, 1)) * width)
  const ys = data.map((v) => height - ((v - min) / (max - min)) * (height - 4) - 2)

  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {fill && <path d={areaPath} fill={color} fillOpacity={0.12} />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Bar chart (horizontal) ────────────────────────────────────────────────────

export interface BarDatum {
  label: string
  value: number
}

interface HBarChartProps {
  data: BarDatum[]
  color?: string
  maxWidth?: number
}

export function HBarChart({ data, color = 'var(--color-brand)', maxWidth = 200 }: HBarChartProps): React.ReactElement {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <div
            className="text-[10px] truncate shrink-0"
            style={{ width: maxWidth * 0.45, color: 'var(--color-app-text-secondary)' }}
            title={d.label}
          >
            {d.label}
          </div>
          <div
            className="flex-1 rounded-full overflow-hidden"
            style={{ height: 6, background: 'var(--color-app-deep)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(d.value / max) * 100}%`, background: color }}
            />
          </div>
          <div className="text-[10px] shrink-0 tabular-nums" style={{ color: 'var(--color-app-text-muted)' }}>
            {d.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  sparkData?: number[]
  trend?: 'up' | 'down' | 'neutral'
}

export function StatCard({ label, value, sub, sparkData, trend }: StatCardProps): React.ReactElement {
  const trendColor = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : 'var(--color-app-text-subtle)'

  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-1 min-w-0"
      style={{ background: 'var(--color-app-raised)', borderColor: 'var(--color-app-border)' }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--color-app-text-subtle)' }}
      >
        {label}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-app-text)' }}>
            {value}
          </div>
          {sub && (
            <div className="text-[10px] mt-0.5" style={{ color: trendColor }}>
              {sub}
            </div>
          )}
        </div>
        {sparkData && sparkData.length > 1 && (
          <div className="opacity-80">
            <Sparkline data={sparkData} width={80} height={28} />
          </div>
        )}
      </div>
    </div>
  )
}

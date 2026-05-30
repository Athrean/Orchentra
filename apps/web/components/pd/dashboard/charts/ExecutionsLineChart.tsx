'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface ExecutionsPoint {
  date: string
  count: number
}

interface TooltipPayload {
  payload: ExecutionsPoint
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null
  const { date, count } = payload[0].payload
  return (
    <div className="rounded-[8px] border border-pg-hairline bg-pg-surface-card p-2 text-xs text-pg-text-0 shadow-[0_8px_24px_-12px_rgba(20,20,19,0.2)]">
      <div className="tracking-wide">{date}</div>
      <div className="tracking-wide text-pg-text-mute">{count} runs</div>
    </div>
  )
}

export function ExecutionsLineChart({ data }: { data: ExecutionsPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-xs text-pg-text-mute">
        No runs in this window.
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgb(20 20 19 / 0.08)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" hide />
        <YAxis hide />
        <Tooltip cursor={{ stroke: 'rgb(20 20 19 / 0.15)' }} content={<ChartTooltip />} />
        <Line type="monotone" dataKey="count" stroke="#23a470" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

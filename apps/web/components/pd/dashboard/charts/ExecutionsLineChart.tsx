'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// TODO(slice E): replace with real db query against executions table
const DATA = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1
  return {
    date: `05-${String(day).padStart(2, '0')}`,
    count: Math.floor(Math.random() * 12),
  }
})

interface TooltipPayload {
  payload: { date: string; count: number }
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null
  const { date, count } = payload[0].payload
  return (
    <div className="rounded-[4px] border border-neutral-800 bg-dark p-2 text-xs text-light">
      <div className="tracking-wide">{date}</div>
      <div className="tracking-wide text-light/70">{count} executions</div>
    </div>
  )
}

export function ExecutionsLineChart() {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={DATA} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgb(38 38 38)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" hide />
        <YAxis hide />
        <Tooltip cursor={{ stroke: 'rgb(38 38 38)' }} content={<ChartTooltip />} />
        <Line type="monotone" dataKey="count" stroke="#6c44fc" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

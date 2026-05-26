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
    <div className="rounded-[4px] border border-neutral-800 bg-dark p-2 text-xs text-light">
      <div className="tracking-wide">{date}</div>
      <div className="tracking-wide text-light/70">{count} runs</div>
    </div>
  )
}

export function ExecutionsLineChart({ data }: { data: ExecutionsPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-xs text-light/40">No runs in this window.</div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgb(38 38 38)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" hide />
        <YAxis hide />
        <Tooltip cursor={{ stroke: 'rgb(38 38 38)' }} content={<ChartTooltip />} />
        <Line type="monotone" dataKey="count" stroke="#23a470" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface MttrPoint {
  day: string
  mttr: number
}

interface TooltipPayload {
  payload: MttrPoint
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null
  const { day, mttr } = payload[0].payload
  return (
    <div className="rounded-[8px] border border-pg-hairline bg-white p-2 text-xs text-pg-text-0 shadow-[0_8px_24px_-12px_rgba(20,20,19,0.2)]">
      <div className="tracking-wide">{day}</div>
      <div className="tracking-wide text-pg-text-mute">{mttr} min</div>
    </div>
  )
}

export function MttrBarChart({ data }: { data: MttrPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-xs text-pg-text-mute">
        No data in this window.
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgb(20 20 19 / 0.08)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'rgb(108 106 100)', fontSize: 10 }} />
        <YAxis hide />
        <Tooltip cursor={{ fill: 'rgb(20 20 19 / 0.06)' }} content={<ChartTooltip />} />
        <Bar dataKey="mttr" fill="#23a470" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

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
    <div className="rounded-[4px] border border-neutral-800 bg-dark p-2 text-xs text-light">
      <div className="tracking-wide">{day}</div>
      <div className="tracking-wide text-light/70">{mttr} min</div>
    </div>
  )
}

export function MttrBarChart({ data }: { data: MttrPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-xs text-light/40">No data in this window.</div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgb(38 38 38)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'rgb(253 249 240 / 0.4)', fontSize: 10 }}
        />
        <YAxis hide />
        <Tooltip cursor={{ fill: 'rgb(38 38 38 / 0.3)' }} content={<ChartTooltip />} />
        <Bar dataKey="mttr" fill="#23a470" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

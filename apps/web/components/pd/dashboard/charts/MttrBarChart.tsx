'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// TODO(slice E): replace with real db query against executions table
const DATA: Array<{ day: string; mttr: number }> = [
  { day: 'Mon', mttr: 4 },
  { day: 'Tue', mttr: 7 },
  { day: 'Wed', mttr: 3 },
  { day: 'Thu', mttr: 9 },
  { day: 'Fri', mttr: 6 },
  { day: 'Sat', mttr: 2 },
  { day: 'Sun', mttr: 5 },
]

interface TooltipPayload {
  payload: { day: string; mttr: number }
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

export function MttrBarChart() {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={DATA} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgb(38 38 38)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'rgb(253 249 240 / 0.4)', fontSize: 10 }}
        />
        <YAxis hide />
        <Tooltip cursor={{ fill: 'rgb(38 38 38 / 0.3)' }} content={<ChartTooltip />} />
        <Bar dataKey="mttr" fill="#6c44fc" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { UsageDay } from '../../../lib/graph/usage'

interface TooltipPayload {
  payload: UsageDay
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null
  const day = payload[0].payload

  return (
    <div className="rounded-[8px] border border-pg-hairline bg-white p-2 text-xs text-pg-text-0 shadow-[0_8px_24px_-12px_rgba(20,20,19,0.2)]">
      <div>{day.day}</div>
      <div className="mt-1 text-pg-text-mute">{day.totalTokens.toLocaleString()} tokens</div>
      <div className="text-pg-text-mute">${day.estimatedCostUsd.toFixed(4)}</div>
    </div>
  )
}

export function UsageDayChart({ data }: { data: UsageDay[] }) {
  const hasUsage = data.some((day) => day.totalTokens > 0 || day.estimatedCostUsd > 0)

  if (!hasUsage) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-pg-text-mute">
        No usage in this range.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgb(20 20 19 / 0.08)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'rgb(108 106 100)', fontSize: 10 }} />
        <YAxis hide />
        <Tooltip cursor={{ fill: 'rgb(20 20 19 / 0.06)' }} content={<ChartTooltip />} />
        <Bar dataKey="totalTokens" fill="#23a470" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

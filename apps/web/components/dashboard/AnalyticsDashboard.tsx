'use client'

import { useState } from 'react'
import { Loader2, BarChart2, AlertCircle } from 'lucide-react'
import { DashboardLayout } from './DashboardLayout'
import { StatCard, HBarChart, Sparkline, type BarDatum } from './AnalyticsCharts'
import { useAnalytics } from '../../lib/hooks'
import { cn } from '../../lib/utils'

// ── Period picker ──────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const

function getPeriodDates(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

function formatMttr(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

function pct(value: number | null): string {
  if (value === null) return '—'
  return `${Math.round(value * 100)}%`
}

// ── Section card ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-3"
      style={{ background: 'var(--color-app-raised)', borderColor: 'var(--color-app-border)' }}
    >
      <div
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--color-app-text-subtle)' }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

// ── AnalyticsDashboard ────────────────────────────────────────────────────────

export function AnalyticsDashboard({ repo }: { repo: string }): React.ReactElement {
  const [period, setPeriod] = useState<7 | 30 | 90>(30)
  const { from, to } = getPeriodDates(period)

  const { data, isLoading, error } = useAnalytics(repo, from, to)

  const dailyRates = data?.dailyFailureRate.map((d) => d.failureRate) ?? []

  const topWorkflowBars: BarDatum[] =
    data?.topFailingWorkflows.map((w) => ({ label: w.workflowName, value: w.failureCount })) ?? []

  const topStepBars: BarDatum[] = data?.topFailedSteps.map((s) => ({ label: s.failedStep, value: s.count })) ?? []

  const mttrBars: BarDatum[] =
    data?.mttrByWorkflow.map((m) => ({ label: m.workflowName, value: m.avgMttrSeconds })) ?? []

  const bestMttr = data?.mttrByWorkflow.length ? Math.min(...data.mttrByWorkflow.map((m) => m.avgMttrSeconds)) : null

  return (
    <DashboardLayout repo={repo} activeNav="monitoring">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between shrink-0 border-b"
        style={{ borderColor: 'var(--color-app-border)' }}
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4" style={{ color: 'var(--color-brand)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-app-text)' }}>
            Analytics
          </span>
        </div>
        <div
          className="flex items-center rounded-lg border overflow-hidden"
          style={{ borderColor: 'var(--color-app-border)' }}
        >
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setPeriod(p.days)}
              className={cn(
                'px-3 py-1 text-[11px] font-medium transition-colors',
                period !== p.days && 'hover:bg-white/4',
              )}
              style={
                period === p.days
                  ? { background: 'var(--color-app-selected)', color: 'var(--color-brand)' }
                  : { color: 'var(--color-app-text-subtle)' }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-app-text-subtle)' }} />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: '#ef4444' }}>
            <AlertCircle className="w-4 h-4" />
            <span>Failed to load analytics</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Summary stat cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Total Incidents"
                value={data?.summary.totalIncidents ?? 0}
                sparkData={data?.dailyFailureRate.map((d) => d.total)}
              />
              <StatCard
                label="Resolution Rate"
                value={pct(data?.summary.resolutionRate ?? null)}
                sub={data?.summary.resolutionRate !== null ? `${data?.summary.resolvedIncidents} resolved` : undefined}
                trend={
                  (data?.summary.resolutionRate ?? 0) > 0.7
                    ? 'up'
                    : (data?.summary.resolutionRate ?? 0) > 0.4
                      ? 'neutral'
                      : 'down'
                }
              />
              <StatCard
                label="Avg Confidence"
                value={data?.summary.avgConfidence != null ? pct(data.summary.avgConfidence) : '—'}
              />
              <StatCard
                label="Best MTTR"
                value={bestMttr !== null ? formatMttr(bestMttr) : '—'}
                sub="fastest workflow"
              />
            </div>

            {/* Failure rate sparkline */}
            {dailyRates.length > 1 && (
              <Section title="Daily Failure Rate">
                <div className="w-full" style={{ height: 60 }}>
                  <Sparkline data={dailyRates} width={600} height={60} fill />
                </div>
                <div className="flex justify-between text-[10px]" style={{ color: 'var(--color-app-text-subtle)' }}>
                  <span>{from}</span>
                  <span>{to}</span>
                </div>
              </Section>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {topWorkflowBars.length > 0 && (
                <Section title="Top Failing Workflows">
                  <HBarChart data={topWorkflowBars} />
                </Section>
              )}
              {topStepBars.length > 0 && (
                <Section title="Common Failed Steps">
                  <HBarChart data={topStepBars} color="#f59e0b" />
                </Section>
              )}
              {mttrBars.length > 0 && (
                <Section title="Avg MTTR by Workflow (seconds)">
                  <HBarChart data={mttrBars} color="#6366f1" />
                </Section>
              )}
            </div>

            {data?.summary.totalIncidents === 0 && (
              <div
                className="flex items-center justify-center py-16 text-sm"
                style={{ color: 'var(--color-app-text-muted)' }}
              >
                No incidents in this period
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Activity, AlertOctagon, CheckCircle2, ExternalLink, GitBranch, Radar, ShieldAlert, Timer } from 'lucide-react'
import { createClient } from '../../../lib/supabase/server'
import { cn } from '../../../lib/utils'
import {
  DETECTION_RANGE_OPTIONS,
  getDetectionRange,
  getDetectionsForUser,
  type Detection,
} from '../../../lib/graph/detections'
import { ExecutionsLineChart } from '../../../components/pd/dashboard/charts/ExecutionsLineChart'
import { ConnectCard } from '../../../components/pd/shared/ConnectCard'

export const metadata = { title: 'Detections · Orchentra' }
export const dynamic = 'force-dynamic'

interface DetectionsPageProps {
  searchParams?: Promise<{ range?: string }>
}

export default async function DetectionsPage({ searchParams }: DetectionsPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const range = getDetectionRange(params?.range)
  const { detections, summary, subscribedRepos, status } = await getDetectionsForUser(user.id, range)

  const mttrLabel = summary.mttrP50Seconds === null ? '—' : formatDuration(summary.mttrP50Seconds)
  const chartData = summary.byDay.map((point) => ({ date: point.day.slice(5), count: point.count }))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-12 pt-8 sm:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-pg-text-mute">Observability</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-pg-text-0">Detections</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-pg-text-mute">
            Continuous failure detection across subscribed repositories — surfaced from CI failure signals before they
            become incidents.
          </p>
        </div>
        <div className="flex rounded-[8px] bg-white p-1 shadow-[0_0_0_1px_rgba(20,20,18,0.06)]">
          {DETECTION_RANGE_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/detections?range=${option.value}`}
              className={cn(
                'rounded-[7px] px-3 py-1.5 text-xs font-medium transition-colors',
                range.value === option.value
                  ? 'bg-pg-text-0 text-white'
                  : 'text-pg-text-mute hover:bg-pg-surface-1 hover:text-pg-text-0',
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <Tile icon={AlertOctagon} label="Open detections" value={String(summary.open)} />
        <Tile icon={CheckCircle2} label="Resolved" value={String(summary.resolved)} />
        <Tile icon={Timer} label="Median time to resolve" value={mttrLabel} />
        <Tile icon={Activity} label="Total in range" value={String(summary.total)} />
      </div>

      <section className="surface p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-pg-text-0">
            <Radar className="h-4 w-4 text-pg-text-mute" />
            Failure signal over time
          </div>
          <span className="text-xs text-pg-text-mute">{subscribedRepos.length} repos scoped</span>
        </div>
        <ExecutionsLineChart data={chartData} />
      </section>

      <section className="surface overflow-hidden">
        <div className="border-b border-pg-hairline px-5 py-4">
          <h2 className="text-sm font-medium text-pg-text-0">Detections</h2>
          <p className="mt-1 text-xs text-pg-text-mute">CI failures with root-cause analysis, most recent first.</p>
        </div>
        {detections.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-pg-text-mute">
            {status === 'error'
              ? 'Detection store is unreachable right now — no data to show.'
              : subscribedRepos.length === 0
                ? 'Subscribe to a repository to start detecting failures.'
                : 'No failures detected in this range.'}
          </div>
        ) : (
          <ul className="divide-y divide-pg-hairline">
            {detections.map((detection) => (
              <DetectionRow key={detection.id} detection={detection} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-pg-text-mute">External signals</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ConnectCard
            icon={ShieldAlert}
            title="Vulnerability alerts"
            reason="Code scanning and Dependabot alerts are not being read for your repositories."
            requiredPermission="security_events: read"
          />
          <ConnectCard
            title="Code quality gates"
            reason="Quality and security gate results are not available."
            integrationName="SonarQube"
          />
          <ConnectCard
            title="Runtime & service health"
            reason="Runtime error and service-health signals are not available."
            integrationName="Sentry / Datadog"
          />
        </div>
      </section>
    </div>
  )
}

function DetectionRow({ detection }: { detection: Detection }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-pg-text-mute">
        <StatusBadge status={detection.status} resolved={detection.resolved} />
        <GitBranch className="h-3.5 w-3.5" />
        {detection.repo}
        <span>·</span>
        <span className="text-pg-text-0">{detection.workflowName}</span>
        {detection.branch && (
          <>
            <span>·</span>
            <span className="font-mono">{detection.branch}</span>
          </>
        )}
        <span className="ml-auto">{detection.occurredAt.toLocaleString()}</span>
      </div>

      {detection.failedStep && (
        <div className="mt-2 text-sm text-pg-text-0">
          Failed step: <span className="font-mono text-pg-text-mute">{detection.failedStep}</span>
        </div>
      )}
      {detection.rootCause && (
        <p className="mt-2 text-sm leading-6 text-pg-text-0">
          <span className="text-pg-text-mute">Root cause: </span>
          {detection.rootCause}
        </p>
      )}
      {detection.suggestedFix && (
        <p className="mt-1 text-sm leading-6 text-pg-text-mute">
          <span className="font-medium text-pg-text-0">Suggested fix: </span>
          {detection.suggestedFix}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {detection.confidence !== null && (
          <span className="inset-chip px-2 py-1 text-pg-text-mute">
            Confidence {Math.round(detection.confidence * 100)}%
          </span>
        )}
        {detection.githubPrUrl && <RowLink href={detection.githubPrUrl}>View PR</RowLink>}
        {detection.githubIssueUrl && <RowLink href={detection.githubIssueUrl}>View issue</RowLink>}
      </div>
    </li>
  )
}

function RowLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-pg-accent-green transition-colors hover:text-pg-accent-green-2"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}

function StatusBadge({ status, resolved }: { status: string; resolved: boolean }) {
  const tone = resolved
    ? 'bg-emerald-500/10 text-emerald-700'
    : status === 'investigating'
      ? 'bg-amber-500/10 text-amber-700'
      : 'bg-red-500/10 text-red-600'
  return (
    <span className={cn('rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium', tone)}>
      {resolved ? 'resolved' : status}
    </span>
  )
}

function Tile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="surface flex min-h-[112px] flex-col justify-between p-4">
      <div className="flex items-center gap-2 text-sm text-pg-text-mute">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-pg-text-0">{value}</div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

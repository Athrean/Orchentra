import { ArrowLeft, CheckCircle2, CircleDashed, ExternalLink, XCircle } from 'lucide-react'
import Link from 'next/link'
import { canRerun, type RunAnnotation, type RunDetail, type RunJob, type RunStep } from '../../../lib/github/run-detail'
import { RerunButton } from './RerunButton'

function statusTone(conclusion: string | null, status: string): { label: string; cls: string } {
  if (status !== 'completed' && conclusion === null) {
    return { label: status.replace(/_/g, ' '), cls: 'bg-amber-500/10 text-amber-700' }
  }
  if (conclusion === 'success') return { label: 'success', cls: 'bg-emerald-500/10 text-emerald-700' }
  if (conclusion === 'failure' || conclusion === 'timed_out') {
    return { label: conclusion.replace(/_/g, ' '), cls: 'bg-red-500/10 text-red-600' }
  }
  return { label: conclusion ?? status, cls: 'bg-pg-surface-2 text-pg-text-mute' }
}

function StepIcon({ conclusion }: { conclusion: string | null }) {
  if (conclusion === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
  if (conclusion === 'failure' || conclusion === 'timed_out') return <XCircle className="h-3.5 w-3.5 text-red-600" />
  return <CircleDashed className="h-3.5 w-3.5 text-pg-text-mute" />
}

function AnnotationRow({ annotation }: { annotation: RunAnnotation }) {
  const isError = annotation.level === 'failure'
  return (
    <li className="flex flex-col gap-0.5 px-4 py-2 text-xs">
      <span className={isError ? 'text-red-600' : 'text-amber-700'}>{annotation.message}</span>
      {annotation.path ? (
        <span className="text-pg-text-mute">
          {annotation.path}
          {annotation.startLine > 0 ? `:${annotation.startLine}` : ''}
        </span>
      ) : null}
    </li>
  )
}

function StepRow({ step }: { step: RunStep }) {
  return (
    <li className="flex items-center gap-2 px-4 py-1.5 text-xs">
      <StepIcon conclusion={step.conclusion} />
      <span className="truncate text-pg-text-mute">{step.name}</span>
    </li>
  )
}

function JobCard({ job }: { job: RunJob }) {
  const tone = statusTone(job.conclusion, job.status)
  return (
    <div
      className={`overflow-hidden rounded-[12px] border bg-white ${
        job.failed ? 'border-red-500/40' : 'border-pg-hairline'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone.cls}`}>{tone.label}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-pg-text-0">{job.name}</span>
        {job.htmlUrl ? (
          <a
            href={job.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-pg-text-mute transition-colors hover:text-pg-text-0"
          >
            Logs on GitHub <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      {job.steps.length > 0 ? (
        <ul className="divide-y divide-pg-hairline border-t border-pg-hairline">
          {job.steps.map((s) => (
            <StepRow key={s.number} step={s} />
          ))}
        </ul>
      ) : null}
      {job.annotations.length > 0 ? (
        <ul className="divide-y divide-pg-hairline border-t border-pg-hairline bg-red-500/[0.04]">
          {job.annotations.map((a, i) => (
            <AnnotationRow key={`${a.path}:${a.startLine}:${i}`} annotation={a} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function RunDetailView({ detail, installationId }: { detail: RunDetail; installationId: number }) {
  const tone = statusTone(detail.conclusion, detail.status)
  const durationMin = detail.durationMs !== null ? Math.round(detail.durationMs / 60_000) : null
  return (
    <div className="space-y-6 p-6">
      <Link
        href="/traces"
        className="inline-flex items-center gap-1.5 text-xs text-pg-text-mute transition-colors hover:text-pg-text-0"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to runs
      </Link>

      <div className="surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone.cls}`}>{tone.label}</span>
          <h1 className="min-w-0 flex-1 truncate text-lg text-pg-text-0">{detail.name}</h1>
          <a
            href={detail.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-pg-text-mute transition-colors hover:text-pg-text-0"
          >
            Open on GitHub <ExternalLink className="h-3 w-3" />
          </a>
          {canRerun(detail) ? (
            <RerunButton installationId={installationId} repoFullName={detail.repoFullName} runId={detail.id} />
          ) : null}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <Meta label="Repo" value={detail.repoFullName} />
          <Meta label="Branch" value={detail.headBranch || '—'} />
          <Meta label="Commit" value={detail.headSha.slice(0, 7)} />
          <Meta label="Event" value={detail.event} />
          <Meta label="Duration" value={durationMin !== null ? `${durationMin}m` : '—'} />
          <Meta label="Started" value={new Date(detail.createdAt).toLocaleString()} />
        </dl>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-pg-text-mute">
          Jobs ({detail.jobs.length})
        </h2>
        <div className="space-y-3">
          {detail.jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-pg-text-mute">{label}</dt>
      <dd className="truncate text-pg-text-0">{value}</dd>
    </div>
  )
}

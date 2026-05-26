import { ArrowLeft, CheckCircle2, CircleDashed, ExternalLink, XCircle } from 'lucide-react'
import Link from 'next/link'
import type { RunDetail, RunJob, RunStep } from '../../../lib/github/run-detail'

function statusTone(conclusion: string | null, status: string): { label: string; cls: string } {
  if (status !== 'completed' && conclusion === null) {
    return { label: status.replace(/_/g, ' '), cls: 'bg-amber-400/10 text-amber-400' }
  }
  if (conclusion === 'success') return { label: 'success', cls: 'bg-emerald-400/10 text-emerald-400' }
  if (conclusion === 'failure' || conclusion === 'timed_out') {
    return { label: conclusion.replace(/_/g, ' '), cls: 'bg-red-400/10 text-red-400' }
  }
  return { label: conclusion ?? status, cls: 'bg-white/5 text-light/60' }
}

function StepIcon({ conclusion }: { conclusion: string | null }) {
  if (conclusion === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  if (conclusion === 'failure' || conclusion === 'timed_out') return <XCircle className="h-3.5 w-3.5 text-red-400" />
  return <CircleDashed className="h-3.5 w-3.5 text-light/40" />
}

function StepRow({ step }: { step: RunStep }) {
  return (
    <li className="flex items-center gap-2 px-4 py-1.5 text-xs">
      <StepIcon conclusion={step.conclusion} />
      <span className="truncate text-light/75">{step.name}</span>
    </li>
  )
}

function JobCard({ job }: { job: RunJob }) {
  const tone = statusTone(job.conclusion, job.status)
  return (
    <div
      className={`overflow-hidden rounded-[8px] border bg-darker ${
        job.failed ? 'border-red-400/30' : 'border-neutral-800'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone.cls}`}>{tone.label}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-light">{job.name}</span>
        {job.htmlUrl ? (
          <a
            href={job.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-light/40 transition-colors hover:text-light"
          >
            Logs on GitHub <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      {job.steps.length > 0 ? (
        <ul className="divide-y divide-neutral-800/60 border-t border-neutral-800">
          {job.steps.map((s) => (
            <StepRow key={s.number} step={s} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function RunDetailView({ detail }: { detail: RunDetail }) {
  const tone = statusTone(detail.conclusion, detail.status)
  const durationMin = detail.durationMs !== null ? Math.round(detail.durationMs / 60_000) : null
  return (
    <div className="space-y-6 p-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs text-light/55 transition-colors hover:text-light"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
      </Link>

      <div className="rounded-[8px] border border-neutral-800 bg-darker p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone.cls}`}>{tone.label}</span>
          <h1 className="min-w-0 flex-1 truncate text-lg text-light">{detail.name}</h1>
          <a
            href={detail.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-light/45 transition-colors hover:text-light"
          >
            Open on GitHub <ExternalLink className="h-3 w-3" />
          </a>
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
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-light/60">Jobs ({detail.jobs.length})</h2>
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
      <dt className="text-light/40">{label}</dt>
      <dd className="truncate text-light/80">{value}</dd>
    </div>
  )
}

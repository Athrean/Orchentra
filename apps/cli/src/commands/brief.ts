import type { WorkflowJob, WorkflowRun } from '@orchentra/cli-api'
import { tailFailingLog } from './log-tail'

const SUMMARY_TAIL_LINES = 40
const DETAIL_TAIL_LINES = 150

export interface JobLogBundle {
  readonly job: WorkflowJob
  readonly logs: string
}

export interface TriageBrief {
  readonly title: string
  readonly summary: string
  readonly details: string
  readonly conclusion: 'failure' | 'success' | 'neutral'
}

export function buildTriageBrief(run: WorkflowRun, bundles: JobLogBundle[]): TriageBrief {
  if (bundles.length === 0) {
    return {
      title: `${run.name ?? 'Workflow'} passed`,
      summary: `No failing jobs on ${run.head_sha.slice(0, 7)}.`,
      details: '',
      conclusion: 'success',
    }
  }

  const failingNames = bundles.map((b) => b.job.name).join(', ')
  const title = `${bundles.length} failing job${bundles.length > 1 ? 's' : ''}: ${failingNames}`

  const summary = bundles
    .map((b) => {
      const errorLine = firstErrorLine(b.logs)
      return `- **${b.job.name}** — ${errorLine ?? 'failure (see logs)'}`
    })
    .join('\n')

  const details = bundles
    .map((b) => {
      const tail = tailFailingLog(b.logs, DETAIL_TAIL_LINES)
      const failingSteps = b.job.steps.filter((s) => s.conclusion === 'failure').map((s) => s.name)
      return [
        `### ${b.job.name}`,
        failingSteps.length > 0 ? `Failing step(s): ${failingSteps.join(', ')}` : '',
        `[Job logs](${b.job.html_url})`,
        '',
        '```log',
        tail,
        '```',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')

  return { title, summary, details, conclusion: 'failure' }
}

export function shortSummary(brief: TriageBrief): string {
  const lines = brief.summary.split('\n').slice(0, 3)
  const truncated = lines.join(' · ').replace(/\*\*/g, '').replace(/^- /, '')
  return truncated.length > 140 ? truncated.slice(0, 137) + '...' : truncated
}

function firstErrorLine(logs: string): string | null {
  const tail = tailFailingLog(logs, SUMMARY_TAIL_LINES)
  const lines = tail.split(/\r?\n/)
  const marker = lines.find((line) => /##\[error\]|^error:|^fatal:|^FAIL/i.test(line))
  return marker?.trim().slice(0, 200) ?? null
}

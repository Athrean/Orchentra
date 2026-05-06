import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

// Hard cap on the returned log payload. GitHub returns the full job log,
// which can grow into the tens of megabytes. Truncate aggressively so we
// stay friendly to MCP transports and LLM context windows. The tail is
// preserved (failure usually surfaces near the end) and a `truncated: true`
// flag tells the caller a head-truncation happened.
const MAX_LOG_BYTES = 1_048_576 // 1 MB

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  jobId: z.number().int().positive().describe('GitHub Actions workflow job id'),
})

type Params = z.infer<typeof parameters>

export interface GetJobLogsResult {
  logs: string
  truncated: boolean
}

export interface GetJobLogsError {
  error: string
}

function decodeLogs(data: string | ArrayBuffer | Buffer): string {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf-8')
  if (Buffer.isBuffer(data)) return data.toString('utf-8')
  return String(data)
}

export const getJobLogsOperation: Operation<Params, GetJobLogsResult | GetJobLogsError> = {
  id: 'get_job_logs',
  description:
    'Download the full log for a single GitHub Actions job. Returns utf-8 text, ' +
    'truncated to the most-recent 1MB if the job emitted more (truncated: true flag).',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'get_job_logs' },
  handler: async (_ctx, { owner, repo, jobId }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().actions.downloadJobLogsForWorkflowRun({
        owner,
        repo,
        job_id: jobId,
      })
      const decoded = decodeLogs(data)
      const buf = Buffer.from(decoded, 'utf-8')
      if (buf.byteLength <= MAX_LOG_BYTES) {
        return { logs: decoded, truncated: false }
      }
      // Keep the tail — failure typically surfaces at the end of a job log.
      const tail = buf.subarray(buf.byteLength - MAX_LOG_BYTES).toString('utf-8')
      return { logs: tail, truncated: true }
    } catch (err) {
      return { error: `Failed to fetch job logs: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}

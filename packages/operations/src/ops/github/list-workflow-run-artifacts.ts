import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  runId: z.number().int().positive().describe('Workflow run id whose artifacts to list'),
})

type Params = z.infer<typeof parameters>

export const listWorkflowRunArtifactsOperation: Operation<Params, unknown> = {
  id: 'list_workflow_run_artifacts',
  description:
    'List artifacts produced by a GitHub Actions workflow run. Each entry reports id, name, sizeInBytes, ' +
    'expired flag, and archiveDownloadUrl. Pair with download_artifact to fetch the bytes.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'list_workflow_run_artifacts' },
  handler: async (_ctx, { owner, repo, runId }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().actions.listWorkflowRunArtifacts({
        owner,
        repo,
        run_id: runId,
      })

      const artifacts = data.artifacts.map((a) => ({
        id: a.id,
        name: a.name,
        sizeInBytes: a.size_in_bytes,
        expired: a.expired,
        archiveDownloadUrl: a.archive_download_url,
      }))

      return { total: data.total_count, artifacts }
    } catch (err) {
      return { error: `Failed to list workflow run artifacts: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}

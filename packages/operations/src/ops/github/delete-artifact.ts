import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  artifactId: z.number().int().positive().describe('GitHub Actions artifact id to delete'),
})

type Params = z.infer<typeof parameters>

export interface DeleteArtifactResult {
  ok: true
}

export interface DeleteArtifactError {
  error: string
}

export const deleteArtifactOperation: Operation<Params, DeleteArtifactResult | DeleteArtifactError> = {
  id: 'delete_artifact',
  description: 'Delete a GitHub Actions artifact by id. Destructive — gated when invoked over a remote transport.',
  scope: 'write',
  trustClass: 'destructive',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'delete_artifact' },
  handler: async (_ctx, { owner, repo, artifactId }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      await getGithubAdapter().actions.deleteArtifact({ owner, repo, artifact_id: artifactId })
      return { ok: true }
    } catch (err) {
      return { error: `Failed to delete artifact: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}

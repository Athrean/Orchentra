import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  secretName: z
    .string()
    .min(1)
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .describe('Secret name. Must start with a letter and contain only [A-Z0-9_].'),
  value: z.string().describe('Plaintext secret value. The adapter encrypts it before sending to GitHub.'),
})

type Params = z.infer<typeof parameters>

export interface SetRepoSecretResult {
  ok: true
  secretName: string
}

export interface SetRepoSecretError {
  error: string
}

export const setRepoSecretOperation: Operation<Params, SetRepoSecretResult | SetRepoSecretError> = {
  id: 'set_repo_secret',
  description:
    'Create or update a GitHub Actions repository secret. The plaintext value is encrypted by the ' +
    'adapter using the repo public key before transit; this op never persists the value locally.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'set_repo_secret' },
  handler: async (_ctx, { owner, repo, secretName, value }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      await getGithubAdapter().actions.setRepoSecret({ owner, repo, secret_name: secretName, value })
      return { ok: true, secretName }
    } catch (err) {
      return { error: `Failed to set repo secret: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}

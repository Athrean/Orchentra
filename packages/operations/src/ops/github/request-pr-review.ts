import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner (login or org).'),
  repo: z.string().describe('Repository name.'),
  pullNumber: z.number().int().positive().describe('Pull request number.'),
  reviewers: z.array(z.string()).optional().describe('Individual reviewer logins.'),
  teamReviewers: z.array(z.string()).optional().describe('Team slugs to request review from.'),
})

type Params = z.infer<typeof parameters>

export interface RequestPrReviewResult {
  ok: true
}

export interface RequestPrReviewError {
  error: string
}

export const requestPrReviewOperation: Operation<Params, RequestPrReviewResult | RequestPrReviewError> = {
  id: 'request_pr_review',
  description:
    'Request review on a pull request from one or more individuals or teams. ' +
    'At least one of reviewers or teamReviewers must be provided.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'request_pr_review' },
  handler: async (_ctx, params) => {
    const fullName = `${params.owner}/${params.repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    const hasReviewers = (params.reviewers?.length ?? 0) > 0
    const hasTeamReviewers = (params.teamReviewers?.length ?? 0) > 0
    if (!hasReviewers && !hasTeamReviewers) {
      return { error: 'At least one of reviewers or teamReviewers must be non-empty' }
    }
    try {
      await getGithubAdapter().pulls.requestReviewers({
        owner: params.owner,
        repo: params.repo,
        pull_number: params.pullNumber,
        reviewers: params.reviewers,
        team_reviewers: params.teamReviewers,
      })
      return { ok: true }
    } catch (err) {
      return { error: `Failed to request review: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}

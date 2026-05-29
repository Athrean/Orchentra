import { tool } from 'ai'
import { z } from 'zod'
import type { RepoSubscription } from '../db/schema'
import { getUserSubscriptions } from '../db/queries/subscriptions'
import { getInsightsForRepos } from '../github/repo-insights'
import { getRecentFailures } from '../graph/detections'

interface ChatToolsOptions {
  userId: string
  scope?: string
}

export function selectScopedSubscriptions(
  subscriptions: RepoSubscription[],
  scope?: string,
  requestedRepo?: string,
): RepoSubscription[] {
  const scopeKey = scope && scope !== 'all-repos' ? scope.toLowerCase() : null
  const requestedKey = requestedRepo?.toLowerCase()

  return subscriptions.filter((subscription) => {
    const repoKey = subscription.repoFullName.toLowerCase()
    if (scopeKey && repoKey !== scopeKey) return false
    if (requestedKey && repoKey !== requestedKey) return false
    return true
  })
}

export function createChatTools({ userId, scope }: ChatToolsOptions) {
  return {
    list_repositories: tool({
      description: 'List repositories the signed-in user has enabled for Orchentra.',
      inputSchema: z.object({}),
      execute: async () => {
        const subscriptions = selectScopedSubscriptions(await getUserSubscriptions(userId), scope)
        return {
          repositories: subscriptions.map((repo) => ({
            repoFullName: repo.repoFullName,
            installationId: repo.installationId,
          })),
          count: subscriptions.length,
        }
      },
    }),
    get_recent_workflow_runs: tool({
      description:
        'Fetch recent GitHub Actions workflow runs for enabled repositories. Use this before answering questions about recent CI status, failures, or latency.',
      inputSchema: z.object({
        repoFullName: z.string().optional().describe('Optional owner/repo filter. Must be one enabled repository.'),
        days: z.number().int().min(1).max(14).default(7).describe('Lookback window in days, from 1 to 14.'),
      }),
      execute: async ({ repoFullName, days }) => {
        const subscriptions = selectScopedSubscriptions(await getUserSubscriptions(userId), scope, repoFullName).slice(
          0,
          10,
        )
        if (subscriptions.length === 0) {
          return { repositories: [], count: 0, message: 'No enabled repositories matched that scope.' }
        }

        const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        const insights = await getInsightsForRepos(
          subscriptions.map((repo) => ({ installationId: repo.installationId, repoFullName: repo.repoFullName })),
          sinceIso,
        )

        return {
          sinceIso,
          repositories: insights.map((repo) => ({
            repoFullName: repo.repoFullName,
            total: repo.total,
            failures: repo.failures,
            successes: repo.successes,
            runs: repo.runs.slice(0, 10),
          })),
          count: insights.length,
        }
      },
    }),
    get_recent_failures: tool({
      description:
        'Recent CI failures with root-cause analysis and suggested fixes for enabled repositories. Use this for failure investigation, root-cause analysis, and "why did X break" questions. An empty list means no recorded failures in the window — NOT that everything is healthy.',
      inputSchema: z.object({
        repoFullName: z.string().optional().describe('Optional owner/repo filter. Must be one enabled repository.'),
        days: z.number().int().min(1).max(30).default(14).describe('Lookback window in days, from 1 to 30.'),
      }),
      execute: async ({ repoFullName, days }) => {
        const scoped = selectScopedSubscriptions(await getUserSubscriptions(userId), scope, repoFullName).slice(0, 25)
        const repos = scoped.map((subscription) => subscription.repoFullName)
        const { failures, dataAvailable } = await getRecentFailures(repos, days, 25)
        return { failures, count: failures.length, dataAvailable, repositories: repos }
      },
    }),
  }
}

import { tool } from 'ai'
import { z } from 'zod'
import type { RepoSubscription } from '../db/schema'
import { getUserSubscriptions } from '../db/queries/subscriptions'
import { insertMemory, recallMemories } from '../db/queries/memories'
import { getInsightsForRepos } from '../github/repo-insights'
import { postIssueComment } from '../github/comment'
import { getRecentFailures } from '../graph/detections'
import type { PermissionMode } from './chat-request'

interface ChatToolsOptions {
  userId: string
  scope?: string
  permissionMode?: PermissionMode
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

export function createChatTools({ userId, scope, permissionMode = 'ask' }: ChatToolsOptions) {
  const readTools = {
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
    save_memory: tool({
      description:
        'Save a durable learning for this user — an error and its fix, a repo-specific pattern, or a stated preference — so it can be recalled in future conversations. Use when you discover something worth remembering or the user asks you to remember it.',
      inputSchema: z.object({
        title: z.string().min(1).max(200).describe('Short headline for the memory.'),
        content: z.string().min(1).max(4000).describe('The learning, fix, or preference to remember.'),
        repo: z.string().optional().describe('Optional owner/repo this memory is specific to.'),
        tags: z.array(z.string().max(40)).max(10).optional().describe('Optional short tags for retrieval.'),
      }),
      execute: async ({ title, content, repo, tags }) => {
        const memory = await insertMemory(userId, { title, content, repo, tags })
        return { ok: true, id: memory.id }
      },
    }),
    recall_memory: tool({
      description:
        'Recall durable learnings previously saved for this user. Call this BEFORE answering when prior context could help, to avoid asking the user to repeat themselves.',
      inputSchema: z.object({
        query: z.string().optional().describe('Optional text to match against memory titles and content.'),
        repo: z.string().optional().describe('Optional owner/repo filter.'),
      }),
      execute: async ({ query, repo }) => {
        const memories = await recallMemories(userId, { query, repo, limit: 10 })
        return {
          count: memories.length,
          memories: memories.map((memory) => ({
            title: memory.title,
            content: memory.content,
            repo: memory.repo,
            tags: memory.tags,
          })),
        }
      },
    }),
  }

  // Write-back tools are only available in "act" mode — the user has opted into
  // letting the assistant change state without per-action confirmation.
  if (permissionMode !== 'act') return readTools

  return {
    ...readTools,
    post_github_comment: tool({
      description:
        'Post a comment to a GitHub issue or pull request — a write-back action. Use only after the user has approved posting. Returns ok:false with an error (e.g. missing permission) instead of failing silently.',
      inputSchema: z.object({
        repoFullName: z.string().describe('owner/repo — must be one enabled repository.'),
        issueNumber: z.number().int().positive().describe('Issue or pull-request number to comment on.'),
        body: z.string().min(1).max(60000).describe('Markdown comment body.'),
      }),
      execute: async ({ repoFullName, issueNumber, body }) => {
        const target = selectScopedSubscriptions(await getUserSubscriptions(userId), scope, repoFullName)[0]
        if (!target) return { ok: false, error: 'repository not enabled or out of scope' }
        return postIssueComment(target.installationId, target.repoFullName, issueNumber, body)
      },
    }),
  }
}

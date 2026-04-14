import { beforeEach, describe, expect, mock, test } from 'bun:test'

let dbUpdates: Record<string, unknown>[] = []
let githubCalls: { method: string; args: Record<string, unknown> }[] = []

mock.module('../src/config', () => ({
  config: {
    github: { token: 'ghp_test', webhook_secret: 'secret', repos: [] },
    delivery: {
      slack: { bot_token: 'xoxb-test', signing_secret: 'ss', channel: '#ci-alerts' },
      github_comments: true,
    },
  },
}))

mock.module('drizzle-orm', () => ({
  eq: (_col: unknown, _val: unknown) => ({}),
  and: (...clauses: unknown[]) => clauses,
  or: (...clauses: unknown[]) => clauses,
  gt: (_col: unknown, _val: unknown) => ({}),
  gte: (_col: unknown, _val: unknown) => ({}),
  lt: (_col: unknown, _val: unknown) => ({}),
  lte: (_col: unknown, _val: unknown) => ({}),
  asc: (col: unknown) => col,
  desc: (col: unknown) => col,
  isNull: (_col: unknown) => ({}),
  isNotNull: (_col: unknown) => ({}),
  inArray: (_col: unknown, _vals: unknown[]) => ({}),
  notInArray: (_col: unknown, _vals: unknown[]) => ({}),
  count: () => 0,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}))

mock.module('../src/db/client', () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        dbUpdates.push(values)
        return { where: () => Promise.resolve() }
      },
    }),
  },
  incidents: {
    id: 'id',
  },
  toolCalls: {},
  resolvedPatterns: {},
  incidentActions: {},
  users: {},
  sessions: {},
  apiKeys: {},
  monitoredRepos: {},
  organizations: {},
  orgMembers: {},
  chatMessages: {},
  webhookEvents: {},
  incidentJobs: {},
}))

mock.module('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    checks = {
      create: async (args: Record<string, unknown>) => {
        githubCalls.push({ method: 'checks.create', args })
        return { data: { id: 9001 } }
      },
      update: async (args: Record<string, unknown>) => {
        githubCalls.push({ method: 'checks.update', args })
        return { data: { id: args.check_run_id } }
      },
    }
    repos = {
      createCommitStatus: async (args: Record<string, unknown>) => {
        githubCalls.push({ method: 'repos.createCommitStatus', args })
        return { data: { id: 1 } }
      },
      listPullRequestsAssociatedWithCommit: async () => {
        return { data: [{ number: 17, state: 'open' }] }
      },
    }
    issues = {
      listComments: async () => ({ data: [] }),
      createComment: async (args: Record<string, unknown>) => {
        githubCalls.push({ method: 'issues.createComment', args })
        return { data: { id: 7001 } }
      },
      updateComment: async (args: Record<string, unknown>) => {
        githubCalls.push({ method: 'issues.updateComment', args })
        return { data: { id: args.comment_id } }
      },
    }
  },
}))

const { publishInitialGithubTriage, publishFinalGithubTriage } = await import('../src/github/triage-writeback')

const testIncident = {
  id: 'inc-001',
  repo: 'my-org/api',
  commit: 'abc1234def5678',
  workflowName: 'CI / Build & Test',
  branch: 'main',
  githubCheckRunId: null,
  githubTriageCommentIds: null,
  rootCause: 'Missing DATABASE_URL in CI',
  suggestedFix: 'Add DATABASE_URL secret',
  confidence: 0.92,
}

beforeEach(() => {
  dbUpdates = []
  githubCalls = []
})

describe('triage writeback', () => {
  test('publishes initial check and pending commit status', async () => {
    await publishInitialGithubTriage(testIncident)

    expect(githubCalls.some((call) => call.method === 'checks.create')).toBe(true)
    expect(githubCalls.some((call) => call.method === 'repos.createCommitStatus')).toBe(true)
    expect(dbUpdates.some((update) => update.githubCheckRunId === 9001)).toBe(true)
  })

  test('publishes successful final triage with PR comment upsert', async () => {
    await publishFinalGithubTriage(testIncident, 'brief_ready')

    const checkCall = githubCalls.find((call) => call.method === 'checks.create')
    const statusCall = githubCalls.find((call) => call.method === 'repos.createCommitStatus')
    const commentCall = githubCalls.find((call) => call.method === 'issues.createComment')

    expect(checkCall).toBeDefined()
    expect(statusCall?.args.state).toBe('success')
    expect(commentCall?.args.body).toContain('Orchentra Triage Results')
    expect(dbUpdates.some((update) => typeof update.githubTriageCommentIds === 'object')).toBe(true)
  })

  test('uses existing IDs to update check run and PR comment on retries', async () => {
    await publishFinalGithubTriage(
      {
        ...testIncident,
        githubCheckRunId: 9001,
        githubTriageCommentIds: { '17': 7001 },
      },
      'error',
    )

    expect(githubCalls.some((call) => call.method === 'checks.update')).toBe(true)
    expect(githubCalls.some((call) => call.method === 'issues.updateComment')).toBe(true)
    expect(githubCalls.some((call) => call.method === 'repos.createCommitStatus' && call.args.state === 'error')).toBe(
      true,
    )
  })
})

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { drizzleMockBase } from './helpers/drizzle-mock'
import { dbClientMockBase } from './helpers/db-client-mock'
import { spawnFakeGitHub } from './fakes/github-server'
import { makeFakeOctokit } from './helpers/fake-octokit'

interface CapturedGhCall {
  method: string
  args: Record<string, unknown>
}

const fake = await spawnFakeGitHub()

let dbUpdates: Record<string, unknown>[] = []
let githubCalls: CapturedGhCall[] = []

mock.module('../src/config', () => ({
  config: {
    github: { token: 'ghp_test', webhook_secret: 'secret', api_base_url: fake.baseUrl, repos: [] },
  },
}))

mock.module('drizzle-orm', () => ({
  ...drizzleMockBase(),
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
  ...dbClientMockBase(),
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        dbUpdates.push(values)
        return { where: () => Promise.resolve() }
      },
    }),
  },
  incidents: { id: 'id' },
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

const { setOctokitForTesting } = await import('../src/github/octokit')

// Build a fake-octokit that records calls + delegates to the fake server.
const realFake = makeFakeOctokit(fake.baseUrl)
const recordedFake = {
  ...realFake,
  checks: {
    create: async (args: Parameters<typeof realFake.checks.create>[0]) => {
      githubCalls.push({ method: 'checks.create', args: args as unknown as Record<string, unknown> })
      return realFake.checks.create(args)
    },
    update: async (args: Parameters<typeof realFake.checks.update>[0]) => {
      githubCalls.push({ method: 'checks.update', args: args as unknown as Record<string, unknown> })
      return realFake.checks.update(args)
    },
  },
  repos: {
    ...realFake.repos,
    createCommitStatus: async (args: Parameters<typeof realFake.repos.createCommitStatus>[0]) => {
      githubCalls.push({ method: 'repos.createCommitStatus', args: args as unknown as Record<string, unknown> })
      return realFake.repos.createCommitStatus(args)
    },
    listPullRequestsAssociatedWithCommit: async (
      args: Parameters<typeof realFake.repos.listPullRequestsAssociatedWithCommit>[0],
    ) => {
      githubCalls.push({
        method: 'repos.listPullRequestsAssociatedWithCommit',
        args: args as unknown as Record<string, unknown>,
      })
      return realFake.repos.listPullRequestsAssociatedWithCommit(args)
    },
  },
  issues: {
    ...realFake.issues,
    createComment: async (args: Parameters<typeof realFake.issues.createComment>[0]) => {
      githubCalls.push({ method: 'issues.createComment', args: args as unknown as Record<string, unknown> })
      return realFake.issues.createComment(args)
    },
    updateComment: async (args: Parameters<typeof realFake.issues.updateComment>[0]) => {
      githubCalls.push({ method: 'issues.updateComment', args: args as unknown as Record<string, unknown> })
      return realFake.issues.updateComment(args)
    },
    listComments: async (args: Parameters<typeof realFake.issues.listComments>[0]) => {
      githubCalls.push({ method: 'issues.listComments', args: args as unknown as Record<string, unknown> })
      return realFake.issues.listComments(args)
    },
  },
}

setOctokitForTesting(recordedFake as never)

fake.setScenario({
  routes: {
    'POST /repos/:owner/:repo/check-runs': (c) => c.json({ id: 9001 }),
    'PATCH /repos/:owner/:repo/check-runs/:check_run_id': (c) => {
      const id = Number(c.req.param('check_run_id'))
      return c.json({ id })
    },
    'POST /repos/:owner/:repo/statuses/:sha': (c) => c.json({ id: 1 }),
    'GET /repos/:owner/:repo/commits/:sha/pulls': (c) => c.json([{ number: 17, state: 'open' }]),
    'GET /repos/:owner/:repo/issues/:issue_number/comments': (c) => c.json([]),
    'POST /repos/:owner/:repo/issues/:issue_number/comments': (c) => c.json({ id: 7001 }),
    'PATCH /repos/:owner/:repo/issues/comments/:comment_id': (c) => {
      const id = Number(c.req.param('comment_id'))
      return c.json({ id })
    },
  },
})

afterAll(async () => {
  await fake.shutdown()
})

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
    expect((commentCall?.args.body as string) ?? '').toContain('Orchentra Triage Results')
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

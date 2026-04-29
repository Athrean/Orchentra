import { afterAll, beforeEach, describe, expect, test, mock } from 'bun:test'
import { drizzleMockBase } from './helpers/drizzle-mock'
import { dbClientMockBase } from './helpers/db-client-mock'
import { spawnFakeGitHub } from './fakes/github-server'
import { makeFakeOctokit } from './helpers/fake-octokit'

const fake = await spawnFakeGitHub()

const octokitAuths: string[] = []
let workflowRunResponses: Array<() => Promise<{ data: { workflow_runs: Array<Record<string, unknown>> } }>> = []

mock.module('../src/config', () => ({
  config: {
    github: {
      webhook_secret: 'secret',
      token: 'app-token',
      api_base_url: fake.baseUrl,
      repos: [],
    },
    llm: {
      api_key: 'test-key',
      model: 'test-model',
      embedding_model: 'test-embedding-model',
    },
  },
}))

mock.module('../src/events', () => ({
  incidentEvents: {
    emitIncidentEvent: () => {},
    emit: () => true,
    on: () => ({}),
    off: () => ({}),
    addListener: () => ({}),
    removeListener: () => ({}),
    setMaxListeners: () => ({}),
    listeners: () => [],
  },
}))

mock.module('../src/db/client', () => ({
  ...dbClientMockBase(),
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [],
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
        groupBy: async () => [],
      }),
    }),
    update: () => ({
      set: () => ({
        where: async () => [],
      }),
    }),
    query: {
      incidents: {
        findFirst: async () => null,
      },
    },
  },
  incidents: {
    id: 'id',
    orgId: 'org_id',
    workflowRunId: 'workflow_run_id',
    repo: 'repo',
    triggeredAt: 'triggered_at',
  },
  toolCalls: {},
  resolvedPatterns: {},
  apiKeys: {},
  sessions: {},
  monitoredRepos: {
    orgId: 'org_id',
    repo: 'repo',
  },
  orgMembers: {
    orgId: 'org_id',
    userId: 'user_id',
  },
  users: {
    githubAccessToken: 'github_access_token',
    id: 'id',
  },
}))

mock.module('drizzle-orm', () => ({
  ...drizzleMockBase(),
  eq: () => ({}),
  max: () => ({}),
}))

const { setOctokitBuilderForTesting } = await import('../src/github/octokit')

// Each call to buildOctokit({auth}) records the auth token and returns a fresh
// fake-octokit whose listWorkflowRunsForRepo pulls from workflowRunResponses.
setOctokitBuilderForTesting(({ auth }) => {
  octokitAuths.push(auth ?? '')
  const realFake = makeFakeOctokit(fake.baseUrl)
  return {
    ...realFake,
    actions: {
      ...realFake.actions,
      listWorkflowRunsForRepo: async () => {
        const next = workflowRunResponses.shift()
        if (!next) throw new Error('No mock workflow run response configured')
        return next()
      },
    },
  } as never
})

const { backfillRepoIncidents } = await import('../src/lib/backfill')

afterAll(async () => {
  await fake.shutdown()
})

describe('backfillRepoIncidents', () => {
  beforeEach(() => {
    octokitAuths.length = 0
    workflowRunResponses = []
  })

  test('only ingests failure-class runs, skipping success/cancelled/neutral', async () => {
    const mixedRuns = [
      {
        id: 1,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'a1',
        conclusion: 'success',
        created_at: '2026-04-14T01:00:00Z',
        head_commit: null,
      },
      {
        id: 2,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'a2',
        conclusion: 'failure',
        created_at: '2026-04-14T02:00:00Z',
        head_commit: null,
      },
      {
        id: 3,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'a3',
        conclusion: 'cancelled',
        created_at: '2026-04-14T03:00:00Z',
        head_commit: null,
      },
      {
        id: 4,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'a4',
        conclusion: 'timed_out',
        created_at: '2026-04-14T04:00:00Z',
        head_commit: null,
      },
      {
        id: 5,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'a5',
        conclusion: 'neutral',
        created_at: '2026-04-14T05:00:00Z',
        head_commit: null,
      },
      {
        id: 6,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'a6',
        conclusion: 'skipped',
        created_at: '2026-04-14T06:00:00Z',
        head_commit: null,
      },
    ]

    workflowRunResponses = [async () => ({ data: { workflow_runs: mixedRuns } })]

    let insertedValues: unknown[] = []
    const { db: mockDb } = await import('../src/db/client')
    const originalInsert = mockDb.insert
    mockDb.insert = (() => ({
      values: (vals: unknown[]) => {
        insertedValues = vals
        return {
          onConflictDoNothing: () => ({
            returning: async () => vals.map(() => ({ id: 'test' })),
          }),
        }
      },
    })) as typeof mockDb.insert

    const originalLog = console.log
    const logs: string[] = []
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    }

    try {
      await backfillRepoIncidents('athrean/orchentra', 'org-1', null, 'app-token')
    } finally {
      console.log = originalLog
      mockDb.insert = originalInsert
    }

    expect(insertedValues).toHaveLength(2)
    const runIds = (insertedValues as Array<{ workflowRunId: number }>).map((v) => v.workflowRunId)
    expect(runIds).toEqual([2, 4])

    const statuses = (insertedValues as Array<{ status: string }>).map((v) => v.status)
    expect(statuses).toEqual(['error', 'error'])
  })

  test('falls back to the configured token when the user token is blocked by org restrictions', async () => {
    workflowRunResponses = [
      async () => {
        const err = new Error('OAuth App access restrictions')
        ;(err as Error & { status?: number }).status = 403
        throw err
      },
      async () => ({ data: { workflow_runs: [] } }),
    ]

    const originalLog = console.log
    const originalWarn = console.warn
    const originalError = console.error
    const logs: string[] = []
    const warns: string[] = []
    const errors: string[] = []

    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    }
    console.warn = (...args: unknown[]) => {
      warns.push(args.map(String).join(' '))
    }
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    }

    try {
      await backfillRepoIncidents('athrean/orchentra', 'org-1', new Date('2026-04-14T00:00:00Z'), 'user-token')
    } finally {
      console.log = originalLog
      console.warn = originalWarn
      console.error = originalError
    }

    expect(octokitAuths).toEqual(['user-token', 'app-token'])
    expect(warns).toEqual([])
    expect(errors).toEqual([])
    expect(logs).toEqual(['Backfill [app]: athrean/orchentra — 0 runs fetched, 0 failures, 0 new (since 2026-04-13)'])
  })
})

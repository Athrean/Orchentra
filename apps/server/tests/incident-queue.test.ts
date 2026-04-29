import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { drizzleMockBase } from './helpers/drizzle-mock'
import { dbClientMockBase } from './helpers/db-client-mock'

let insertedJobs: Record<string, unknown>[] = []
let insertConflictTargets: unknown[] = []
let agentCalls: string[] = []
let completedJobIds: string[] = []
let nextIncidentStatusAfterRun: 'brief_ready' | 'error' = 'brief_ready'

const incidentsById: Record<string, { id: string; status: string }> = {}

mock.module('drizzle-orm', () => ({
  ...drizzleMockBase(),
  eq: (_col: unknown, val: unknown) => ({ val }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}))

mock.module('../src/db/client', () => ({
  ...dbClientMockBase(),
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertedJobs.push(values)
        return {
          onConflictDoNothing: ({ target }: { target: unknown }) => {
            insertConflictTargets.push(target)
            return Promise.resolve()
          },
        }
      },
    }),
    select: () => ({
      from: () => ({
        where: (condition: { val: string }) => ({
          limit: async () => {
            const incident = incidentsById[condition.val]
            if (!incident) return []
            return [{ ...incident }]
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition: { val: string }) => {
          if (values.status === 'completed') {
            completedJobIds.push(condition.val)
          }
          return Promise.resolve()
        },
      }),
    }),
    execute: async () => [],
  },
  incidents: {
    id: 'id',
    status: 'status',
  },
  incidentJobs: {
    id: 'id',
    incidentId: 'incident_id',
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
}))

mock.module('../src/agent/runner', () => ({
  runIncidentAgent: async (incident: { id: string }) => {
    agentCalls.push(incident.id)
    incidentsById[incident.id].status = nextIncidentStatusAfterRun
  },
}))

const { PgJobQueue } = await import('../src/lib/pg-job-queue')
const queue = new PgJobQueue()
const enqueueInvestigateJob = queue.enqueueInvestigateJob.bind(queue)
const processIncidentJob = queue.processIncidentJob.bind(queue)

beforeEach(() => {
  insertedJobs = []
  insertConflictTargets = []
  agentCalls = []
  completedJobIds = []
  nextIncidentStatusAfterRun = 'brief_ready'

  incidentsById['inc-1'] = {
    id: 'inc-1',
    status: 'investigating',
  }
})

describe('incident queue', () => {
  test('enqueueInvestigateJob inserts queued job with incident conflict guard', async () => {
    await enqueueInvestigateJob({
      id: 'inc-1',
      orgId: 'org-1',
      repo: 'my-org/api',
      branch: 'main',
      commit: 'abc123',
      workflowName: 'CI',
      commitMessage: null,
      workflowRunId: 123,
      failedStep: null,
      status: 'investigating',
      briefJson: null,
      confidence: null,
      rootCause: null,
      suggestedFix: null,
      githubIssueUrl: null,
      githubPrUrl: null,
      githubCheckRunId: null,
      githubTriageCommentIds: null,
      snoozedUntil: null,
      escalatedAt: null,
      tokenInputs: null,
      tokenOutputs: null,
      estimatedCostUsd: null,
      triggeredAt: new Date(),
      resolvedAt: null,
      mttrSeconds: null,
      createdAt: new Date(),
    })

    expect(insertedJobs).toHaveLength(1)
    expect(insertedJobs[0].incidentId).toBe('inc-1')
    expect(insertedJobs[0].status).toBe('queued')
    expect(insertConflictTargets).toHaveLength(1)
  })

  test('retry processing runs agent again and marks both jobs completed', async () => {
    await processIncidentJob({
      id: 'job-1',
      incidentId: 'inc-1',
      status: 'processing',
      attempts: 1,
      maxAttempts: 3,
      nextRunAt: new Date(),
      error: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
    })

    incidentsById['inc-1'].status = 'investigating'

    await processIncidentJob({
      id: 'job-2',
      incidentId: 'inc-1',
      status: 'processing',
      attempts: 2,
      maxAttempts: 3,
      nextRunAt: new Date(),
      error: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
    })

    expect(agentCalls).toEqual(['inc-1', 'inc-1'])
    expect(completedJobIds).toEqual(['job-1', 'job-2'])
  })

  test('throws when agent ends incident in error status', async () => {
    nextIncidentStatusAfterRun = 'error'

    await expect(
      processIncidentJob({
        id: 'job-3',
        incidentId: 'inc-1',
        status: 'processing',
        attempts: 1,
        maxAttempts: 3,
        nextRunAt: new Date(),
        error: null,
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
      }),
    ).rejects.toThrow('Agent investigation failed')
  })
})

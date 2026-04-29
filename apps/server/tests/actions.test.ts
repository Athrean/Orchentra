import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { drizzleMockBase } from './helpers/drizzle-mock'
import { dbClientMockBase } from './helpers/db-client-mock'
import { incidentsQueriesMockBase } from './helpers/incidents-queries-mock'

// --- Test state ---
let storedIncidents: Record<string, Record<string, unknown>> = {}
let insertedActions: Record<string, unknown>[] = []
let updatedFields: Record<string, unknown>[] = []
let githubApiCalls: { method: string; args: Record<string, unknown> }[] = []
let emittedEvents: { type: string; incidentId: string }[] = []
let savedPatternIncidentIds: string[] = []

let findIncidentByPrUrlResult: Record<string, unknown> | null = null
let findFixingIncidentResult: Record<string, unknown> | null = null

const TEST_INCIDENT = {
  id: 'inc-001',
  repo: 'my-org/api',
  branch: 'main',
  commit: 'abc1234def5678',
  workflowName: 'CI Tests',
  workflowRunId: 12345,
  status: 'brief_ready',
  briefJson: JSON.stringify({
    failureType: 'env_missing',
    summary: 'DATABASE_URL not set in CI',
    rootCause: 'Missing DATABASE_URL environment variable',
    suggestedFix: 'Add DATABASE_URL to CI environment secrets',
    confidence: 0.92,
  }),
  rootCause: 'Missing DATABASE_URL environment variable',
  suggestedFix: 'Add DATABASE_URL to CI environment secrets',
  confidence: 0.92,
  githubIssueUrl: null,
  githubPrUrl: null,
  snoozedUntil: null,
  escalatedAt: null,
  triggeredAt: new Date('2026-03-26T10:00:00Z'),
  resolvedAt: null,
  mttrSeconds: null,
  createdAt: new Date('2026-03-26T10:00:00Z'),
}

// --- Mocks ---
mock.module('../src/config', () => ({
  config: {
    github: { webhook_secret: 'secret', token: 'ghp_test', repos: [] },
  },
}))

mock.module('drizzle-orm', () => ({
  ...drizzleMockBase(),
  eq: (col: unknown, val: unknown) => ({ col, val }),
  desc: (col: unknown) => ({ col, dir: 'desc' }),
  count: () => 'count',
}))

mock.module('../src/db/client', () => ({
  ...dbClientMockBase(),
  db: {
    insert: () => ({
      values: (val: Record<string, unknown>) => {
        insertedActions.push(val)
        return Promise.resolve()
      },
    }),
    update: () => ({
      set: (fields: Record<string, unknown>) => ({
        where: () => {
          updatedFields.push(fields)
          return Promise.resolve()
        },
      }),
    }),
    query: {
      incidents: {
        findFirst: async (opts: { where: { val: string } }) => {
          const id = opts.where.val
          return storedIncidents[id] ?? null
        },
      },
    },
  },
  incidents: {
    id: 'id',
    status: 'status',
    githubIssueUrl: 'github_issue_url',
    githubPrUrl: 'github_pr_url',
    snoozedUntil: 'snoozed_until',
    escalatedAt: 'escalated_at',
    resolvedAt: 'resolved_at',
    mttrSeconds: 'mttr_seconds',
  },
  incidentActions: {
    id: 'id',
    incidentId: 'incident_id',
    actionType: 'action_type',
    performedBy: 'performed_by',
    metadata: 'metadata',
    createdAt: 'created_at',
  },
  toolCalls: {},
  resolvedPatterns: {},
  users: {},
  sessions: {},
  apiKeys: {},
  monitoredRepos: {},
}))

mock.module('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    actions = {
      reRunWorkflowFailedJobs: async (args: Record<string, unknown>) => {
        githubApiCalls.push({ method: 'reRunWorkflowFailedJobs', args })
        return { status: 201 }
      },
    }
    issues = {
      create: async (args: Record<string, unknown>) => {
        githubApiCalls.push({ method: 'issues.create', args })
        return {
          data: {
            html_url: `https://github.com/${args.owner}/${args.repo}/issues/42`,
            number: 42,
          },
        }
      },
    }
    git = {
      getRef: async (args: Record<string, unknown>) => {
        githubApiCalls.push({ method: 'git.getRef', args })
        return { data: { object: { sha: 'base-sha-123' } } }
      },
      createRef: async (args: Record<string, unknown>) => {
        githubApiCalls.push({ method: 'git.createRef', args })
        return { data: {} }
      },
      getCommit: async (args: Record<string, unknown>) => {
        githubApiCalls.push({ method: 'git.getCommit', args })
        return { data: { tree: { sha: 'tree-sha-456' } } }
      },
      createCommit: async (args: Record<string, unknown>) => {
        githubApiCalls.push({ method: 'git.createCommit', args })
        return { data: { sha: 'new-commit-sha-789' } }
      },
      updateRef: async (args: Record<string, unknown>) => {
        githubApiCalls.push({ method: 'git.updateRef', args })
        return { data: {} }
      },
      createBlob: async (args: Record<string, unknown>) => {
        githubApiCalls.push({ method: 'git.createBlob', args })
        return { data: { sha: `blob-sha-${args.content?.toString().slice(0, 8)}` } }
      },
      createTree: async (args: Record<string, unknown>) => {
        githubApiCalls.push({ method: 'git.createTree', args })
        return { data: { sha: 'new-tree-sha-999' } }
      },
    }
    pulls = {
      create: async (args: Record<string, unknown>) => {
        githubApiCalls.push({ method: 'pulls.create', args })
        return {
          data: {
            html_url: `https://github.com/${args.owner}/${args.repo}/pull/7`,
            number: 7,
          },
        }
      },
    }
  },
}))

mock.module('../src/events', () => ({
  incidentEvents: {
    emitIncidentEvent: (event: { type: string; incidentId: string }) => {
      emittedEvents.push(event)
    },
    emit: () => true,
    on: () => ({}),
    off: () => ({}),
    addListener: () => ({}),
    removeListener: () => ({}),
    setMaxListeners: () => ({}),
    listeners: () => [],
  },
}))

mock.module('../src/agent/patterns', () => ({
  saveResolvedPattern: async (incidentId: string) => {
    savedPatternIncidentIds.push(incidentId)
  },
}))

mock.module('../src/queries/incidents', () => ({
  ...incidentsQueriesMockBase(),
  findIncidentByPrUrl: async (_prUrl: string, _orgId: string) => findIncidentByPrUrlResult,
  findFixingIncidentForRepoBranch: async (_repo: string, _branch: string, _orgId: string) => findFixingIncidentResult,
}))

mock.module('../src/lib/repo-cache', () => ({
  isRepoMonitored: async () => true,
  getMonitoredRepos: async () => new Set(['my-org/api']),
  invalidateMonitoredReposCache: () => {},
}))

// Import handlers AFTER mocks
const {
  rerunWorkflow,
  createGithubIssue,
  createFixPR,
  updateIncidentStatus,
  escalateIncident,
  handleFixPRMerged,
  autoResolveAfterCIPass,
} = await import('../src/actions/handlers')

beforeEach(() => {
  storedIncidents = { 'inc-001': { ...TEST_INCIDENT } }
  insertedActions = []
  updatedFields = []
  githubApiCalls = []
  emittedEvents = []
  savedPatternIncidentIds = []
  findIncidentByPrUrlResult = null
  findFixingIncidentResult = null
})

// ─── Re-run Workflow ───────────────────────

describe('rerunWorkflow', () => {
  test('re-runs failed workflow via GitHub API', async () => {
    const result = await rerunWorkflow('inc-001', 'user-1')

    expect(result.success).toBe(true)
    expect(result.data?.runUrl).toContain('actions/runs/12345')

    // Called GitHub API
    const apiCall = githubApiCalls.find((c) => c.method === 'reRunWorkflowFailedJobs')
    expect(apiCall).toBeTruthy()
    expect(apiCall!.args.owner).toBe('my-org')
    expect(apiCall!.args.repo).toBe('api')
    expect(apiCall!.args.run_id).toBe(12345)

    // Updated status
    expect(updatedFields[0]?.status).toBe('fixing')

    // Recorded action
    expect(insertedActions.length).toBe(1)
    expect(insertedActions[0].actionType).toBe('rerun')

    // Emitted SSE event
    expect(emittedEvents.length).toBe(1)
    expect(emittedEvents[0].type).toBe('incident:status_changed')
  })

  test('rejects if incident not found', async () => {
    const result = await rerunWorkflow('nonexistent', null)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Incident not found')
  })

  test('rejects if status is not brief_ready or error', async () => {
    storedIncidents['inc-001'] = { ...TEST_INCIDENT, status: 'resolved' }
    const result = await rerunWorkflow('inc-001', null)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Cannot re-run')
  })

  test('rejects if no workflow run ID', async () => {
    storedIncidents['inc-001'] = { ...TEST_INCIDENT, workflowRunId: null }
    const result = await rerunWorkflow('inc-001', null)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No workflow run ID')
  })
})

// ─── Create GitHub Issue ────────────────────

describe('createGithubIssue', () => {
  test('creates a GitHub issue with correct fields', async () => {
    const result = await createGithubIssue('inc-001', 'user-1')

    expect(result.success).toBe(true)
    expect(result.data?.issueUrl).toContain('/issues/42')
    expect(result.data?.issueNumber).toBe(42)

    // GitHub API called with correct owner/repo
    const apiCall = githubApiCalls.find((c) => c.method === 'issues.create')
    expect(apiCall).toBeTruthy()
    expect(apiCall!.args.owner).toBe('my-org')
    expect(apiCall!.args.repo).toBe('api')
    expect(apiCall!.args.title).toContain('[CI Failure]')
    expect(apiCall!.args.title).toContain('Missing DATABASE_URL')

    // Stored issue URL on incident
    expect(updatedFields[0]?.githubIssueUrl).toContain('/issues/42')

    // Recorded action
    expect(insertedActions[0].actionType).toBe('create_issue')
  })

  test('emits incident:updated event after creating issue', async () => {
    await createGithubIssue('inc-001', 'user-1')

    const event = emittedEvents.find((e) => e.type === 'incident:updated')
    expect(event).toBeTruthy()
    expect(event!.incidentId).toBe('inc-001')
  })

  test('returns existing URL if issue already created', async () => {
    storedIncidents['inc-001'] = {
      ...TEST_INCIDENT,
      githubIssueUrl: 'https://github.com/my-org/api/issues/99',
    }

    const result = await createGithubIssue('inc-001', 'user-1')
    expect(result.success).toBe(true)
    expect(result.data?.alreadyExists).toBe(true)
    expect(result.data?.issueUrl).toContain('/issues/99')

    // No GitHub API call
    expect(githubApiCalls.length).toBe(0)
  })

  test('rejects if no brief available', async () => {
    storedIncidents['inc-001'] = { ...TEST_INCIDENT, briefJson: null }
    const result = await createGithubIssue('inc-001', null)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No brief available')
  })

  test('rejects if incident not found', async () => {
    const result = await createGithubIssue('nonexistent', null)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Incident not found')
    expect(result.httpStatus).toBe(404)
  })

  test('rejects if briefJson is malformed', async () => {
    storedIncidents['inc-001'] = { ...TEST_INCIDENT, briefJson: 'not-json{{' }
    const result = await createGithubIssue('inc-001', null)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to parse')
  })
})

// ─── Create Fix PR ──────────────────────────

describe('createFixPR', () => {
  test('creates branch and PR via GitHub API', async () => {
    const result = await createFixPR('inc-001', 'user-1')

    expect(result.success).toBe(true)
    expect(result.data?.prUrl).toContain('/pull/7')
    expect(result.data?.prNumber).toBe(7)

    // Verify GitHub API call sequence
    const methods = githubApiCalls.map((c) => c.method)
    expect(methods).toContain('git.getRef')
    expect(methods).toContain('git.createRef')
    expect(methods).toContain('pulls.create')

    // Created the fix branch
    const createRef = githubApiCalls.find((c) => c.method === 'git.createRef')
    expect(createRef!.args.ref as string).toContain('fix/orchentra-')

    // PR targets the incident branch
    const prCreate = githubApiCalls.find((c) => c.method === 'pulls.create')
    expect(prCreate!.args.base).toBe('main')

    // Updated incident with PR URL and status
    expect(updatedFields[0]?.githubPrUrl).toContain('/pull/7')
    expect(updatedFields[0]?.status).toBe('fixing')
  })

  test('returns existing PR if already created', async () => {
    storedIncidents['inc-001'] = {
      ...TEST_INCIDENT,
      githubPrUrl: 'https://github.com/my-org/api/pull/5',
    }

    const result = await createFixPR('inc-001', null)
    expect(result.success).toBe(true)
    expect(result.data?.alreadyExists).toBe(true)
  })

  test('rejects if no suggested fix', async () => {
    storedIncidents['inc-001'] = { ...TEST_INCIDENT, suggestedFix: null }
    const result = await createFixPR('inc-001', null)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No suggested fix')
  })

  test('rejects if no brief available', async () => {
    storedIncidents['inc-001'] = { ...TEST_INCIDENT, briefJson: null }
    const result = await createFixPR('inc-001', null)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No brief available')
  })

  test('rejects if briefJson is malformed', async () => {
    storedIncidents['inc-001'] = { ...TEST_INCIDENT, briefJson: '{broken' }
    const result = await createFixPR('inc-001', null)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to parse')
  })

  test('rejects if incident not found', async () => {
    const result = await createFixPR('nonexistent', null)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Incident not found')
    expect(result.httpStatus).toBe(404)
  })

  test('applies file patches via blob/tree API when patchJson is present', async () => {
    storedIncidents['inc-001'] = {
      ...TEST_INCIDENT,
      patchJson: JSON.stringify({
        patches: [
          { path: 'src/auth.ts', action: 'modify', content: 'export function login() {}' },
          { path: 'src/deprecated.ts', action: 'delete' },
        ],
      }),
    }

    const result = await createFixPR('inc-001', null)
    expect(result.success).toBe(true)

    const methods = githubApiCalls.map((c) => c.method)
    expect(methods).toContain('git.createBlob')
    expect(methods).toContain('git.createTree')

    // createBlob should be called for the modify patch (not for delete)
    const blobCalls = githubApiCalls.filter((c) => c.method === 'git.createBlob')
    expect(blobCalls.length).toBe(1)
    expect(blobCalls[0].args.content).toBe('export function login() {}')

    // PR body should list changed files
    const prCreate = githubApiCalls.find((c) => c.method === 'pulls.create')
    expect(prCreate!.args.body).toContain('src/auth.ts')
    expect(prCreate!.args.body).toContain('src/deprecated.ts')
  })

  test('falls back to metadata-only PR when no patchJson', async () => {
    storedIncidents['inc-001'] = { ...TEST_INCIDENT, patchJson: null }

    const result = await createFixPR('inc-001', null)
    expect(result.success).toBe(true)

    const methods = githubApiCalls.map((c) => c.method)
    // No blob/tree calls for metadata-only PR
    expect(methods).not.toContain('git.createBlob')
    expect(methods).not.toContain('git.createTree')

    // PR body should note manual fix needed
    const prCreate = githubApiCalls.find((c) => c.method === 'pulls.create')
    expect(prCreate!.args.body).toContain('manual fix needed')
  })
})

// ─── Update Status ──────────────────────────

describe('updateIncidentStatus', () => {
  test('resolves incident with MTTR calculation', async () => {
    const result = await updateIncidentStatus('inc-001', 'resolved', 'user-1')

    expect(result.success).toBe(true)
    expect(result.data?.status).toBe('resolved')

    // Should set resolvedAt and mttrSeconds
    expect(updatedFields[0]?.resolvedAt).toBeInstanceOf(Date)
    expect(typeof updatedFields[0]?.mttrSeconds).toBe('number')
  })

  test('dismisses incident and records action', async () => {
    const result = await updateIncidentStatus('inc-001', 'dismissed', 'user-1')

    expect(result.success).toBe(true)
    expect(updatedFields[0]?.status).toBe('dismissed')
    expect(insertedActions[0].actionType).toBe('dismissed')
  })

  test('snoozes incident with snoozedUntil', async () => {
    const until = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const result = await updateIncidentStatus('inc-001', 'snoozed', 'user-1', until)

    expect(result.success).toBe(true)
    expect(updatedFields[0]?.snoozedUntil).toEqual(until)
  })

  test('rejects if incident not found', async () => {
    const result = await updateIncidentStatus('nope', 'resolved', null)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Incident not found')
    expect(result.httpStatus).toBe(404)
  })

  test('rejects invalid status values', async () => {
    const result = await updateIncidentStatus('inc-001', 'escalated', null)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid status')
  })

  test('emits SSE event on status change', async () => {
    await updateIncidentStatus('inc-001', 'dismissed', 'user-1')
    expect(emittedEvents).toHaveLength(1)
    expect(emittedEvents[0].type).toBe('incident:status_changed')
    expect(emittedEvents[0].incidentId).toBe('inc-001')
  })

  test('resolve without triggeredAt skips MTTR', async () => {
    storedIncidents['inc-001'] = { ...TEST_INCIDENT, triggeredAt: null }
    const result = await updateIncidentStatus('inc-001', 'resolved', null)
    expect(result.success).toBe(true)
    expect(updatedFields[0]?.resolvedAt).toBeInstanceOf(Date)
    expect(updatedFields[0]?.mttrSeconds).toBeUndefined()
  })
})

// ─── Escalate ───────────────────────────────

describe('escalateIncident', () => {
  test('updates status, records action, and emits event', async () => {
    const result = await escalateIncident('inc-001', 'user-1')

    expect(result.success).toBe(true)

    // Updated status
    expect(updatedFields[0]?.status).toBe('escalated')
    expect(updatedFields[0]?.escalatedAt).toBeInstanceOf(Date)

    // Recorded action
    expect(insertedActions[0].actionType).toBe('escalate')

    // Emitted SSE event
    const event = emittedEvents.find((e) => e.type === 'incident:status_changed')
    expect(event).toBeTruthy()
  })

  test('rejects if already escalated', async () => {
    storedIncidents['inc-001'] = { ...TEST_INCIDENT, status: 'escalated' }
    const result = await escalateIncident('inc-001', null)
    expect(result.success).toBe(false)
    expect(result.error).toContain('already escalated')
  })

  test('rejects if incident not found', async () => {
    const result = await escalateIncident('nope', null)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Incident not found')
  })
})

describe('handleFixPRMerged', () => {
  test('records action when incident exists', async () => {
    findIncidentByPrUrlResult = { ...TEST_INCIDENT }

    await handleFixPRMerged('https://github.com/my-org/api/pull/7', 7, 'org-1')

    const prMergedAction = insertedActions.find((action) => action.actionType === 'pr_merged')
    expect(prMergedAction).toBeTruthy()
  })

  test('no-ops when PR URL does not map to an incident', async () => {
    findIncidentByPrUrlResult = null

    await handleFixPRMerged('https://github.com/my-org/api/pull/999', 999, 'org-1')

    expect(insertedActions).toHaveLength(0)
  })
})

describe('autoResolveAfterCIPass', () => {
  test('auto-resolves matching fixing incident and saves pattern', async () => {
    findFixingIncidentResult = {
      ...TEST_INCIDENT,
      status: 'fixing',
      briefJson: TEST_INCIDENT.briefJson,
    }

    await autoResolveAfterCIPass('my-org/api', 'main', 12345, 'org-1')

    expect(updatedFields[0]?.status).toBe('resolved')

    const autoResolvedAction = insertedActions.find((action) => action.actionType === 'auto_resolved')
    expect(autoResolvedAction).toBeTruthy()

    const event = emittedEvents.find((item) => item.type === 'incident:status_changed')
    expect(event).toBeTruthy()
    expect(savedPatternIncidentIds).toContain('inc-001')
  })

  test('no-ops when no fixing incident matches repo/branch', async () => {
    findFixingIncidentResult = null
    await autoResolveAfterCIPass('my-org/api', 'main', 12345, 'org-1')
    expect(updatedFields).toHaveLength(0)
    expect(insertedActions).toHaveLength(0)
  })
})

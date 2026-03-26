# Phase 2: ReAct Agent + GitHub Actions Tool + Block Kit + Interactions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-shot LLM classification with a multi-round ReAct agent that fetches real GitHub Actions logs, delivers rich Block Kit Slack messages with action buttons, and handles button clicks.

**Architecture:** Two-phase agent (generateText with tools for investigation, generateObject for structured synthesis). Each issue gets its own branch off main, merged sequentially. Tools are registered as Vercel AI SDK `tool()` definitions. Block Kit is a pure function. Interactions verify Slack signatures and dispatch async.

**Tech Stack:** Vercel AI SDK (`generateText`, `tool`), Octokit REST, Slack Block Kit (`KnownBlock`), Bun test runner, Zod

**Spec:** `docs/superpowers/specs/2026-03-23-phase2-react-loop-design.md`

**Issues:** #6, #5, #8, #9

---

## Build Order & Branch Strategy

Each task maps to a GitHub issue and its own branch. They merge sequentially:

1. **Task 1** → Issue #6 → `feat/6-github-actions-tool` (standalone)
2. **Task 2** → Issue #5 → `feat/5-react-agent-loop` (depends on #6 merged)
3. **Task 3** → Issue #8 → `feat/8-block-kit-messages` (depends on #5 merged — needs brief data shape)
4. **Task 4** → Issue #9 → `feat/9-slack-interactions` (depends on #8 merged)

---

## File Map

| File                                            | Action  | Task | Purpose                                          |
| ----------------------------------------------- | ------- | ---- | ------------------------------------------------ |
| `apps/server/src/agent/tools/github-actions.ts` | Create  | 1    | `get_workflow_logs` AI SDK tool                  |
| `apps/server/tests/github-actions-tool.test.ts` | Create  | 1    | Test log fetching with mocked Octokit            |
| `apps/server/src/agent/runner.ts`               | Rewrite | 2    | Two-phase ReAct loop                             |
| `apps/server/src/agent/prompts.ts`              | Expand  | 2    | Add AGENT_SYSTEM_PROMPT, SYNTHESIS_PROMPT        |
| `apps/server/tests/agent.test.ts`               | Rewrite | 2    | Test two-phase flow + tool call logging          |
| `apps/server/src/slack/blocks.ts`               | Create  | 3    | Pure Block Kit builder for all message states    |
| `apps/server/src/slack/message.ts`              | Update  | 3    | Use blocks, add thread replies                   |
| `apps/server/tests/blocks.test.ts`              | Create  | 3    | Test each message state output                   |
| `apps/server/tests/slack-message.test.ts`       | Update  | 3    | Test Block Kit integration                       |
| `apps/server/src/routes/interactions.ts`        | Rewrite | 4    | Button click handler with signature verification |
| `apps/server/tests/interactions.test.ts`        | Create  | 4    | Test signature, action routing, DB updates       |

---

## Task 1: GitHub Actions Log Fetching Tool (Issue #6)

**Branch:** `feat/6-github-actions-tool`

**Files:**

- Create: `apps/server/src/agent/tools/github-actions.ts`
- Create: `apps/server/tests/github-actions-tool.test.ts`

### Steps

- [ ] **Step 1: Create the tools directory**

Run: `mkdir -p apps/server/src/agent/tools`

- [ ] **Step 2: Write the failing test**

Create `apps/server/tests/github-actions-tool.test.ts`:

```typescript
import { describe, test, expect, mock, beforeEach } from 'bun:test'

let listJobsCalls: { owner: string; repo: string; run_id: number }[] = []
let downloadLogsCalls: { owner: string; repo: string; job_id: number }[] = []
let mockJobs: { jobs: Record<string, unknown>[] } = { jobs: [] }
let mockLogsText = ''

mock.module('../src/config', () => ({
  config: {
    github: {
      token: 'ghp_test',
      webhook_secret: 'test',
      repos: ['my-org/api'],
    },
  },
}))

mock.module('@octokit/rest', () => ({
  Octokit: class {
    actions = {
      listJobsForWorkflowRun: async (params: { owner: string; repo: string; run_id: number }) => {
        listJobsCalls.push(params)
        return { data: mockJobs }
      },
      downloadJobLogsForWorkflowRun: async (params: { owner: string; repo: string; job_id: number }) => {
        downloadLogsCalls.push(params)
        return { data: mockLogsText }
      },
    }
  },
}))

const { githubActionsTool } = await import('../src/agent/tools/github-actions')

beforeEach(() => {
  listJobsCalls = []
  downloadLogsCalls = []
  mockJobs = { jobs: [] }
  mockLogsText = ''
})

describe('githubActionsTool', () => {
  test('has correct tool description and parameters', () => {
    expect(githubActionsTool.description).toContain('GitHub Actions')
    expect(githubActionsTool.parameters).toBeDefined()
  })

  test('returns error when no failed job found', async () => {
    mockJobs = {
      jobs: [{ id: 1, name: 'Build', conclusion: 'success', steps: [], started_at: null, completed_at: null }],
    }

    const result = await githubActionsTool.execute(
      { owner: 'my-org', repo: 'api', runId: 123 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal },
    )
    expect(result).toHaveProperty('error')
  })

  test('fetches logs for failed job and returns last 300 lines', async () => {
    mockJobs = {
      jobs: [
        {
          id: 42,
          name: 'Build & Test',
          conclusion: 'failure',
          steps: [
            { name: 'Checkout', conclusion: 'success' },
            { name: 'Run tests', conclusion: 'failure' },
          ],
          started_at: '2026-03-24T10:00:00Z',
          completed_at: '2026-03-24T10:02:30Z',
        },
      ],
    }
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`)
    mockLogsText = lines.join('\n')

    const result = await githubActionsTool.execute(
      { owner: 'my-org', repo: 'api', runId: 123 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal },
    )

    expect(result.jobName).toBe('Build & Test')
    expect(result.failedStep).toBe('Run tests')
    expect(result.logs.split('\n').length).toBe(300)
    expect(result.logs).toContain('line 201')
    expect(result.durationSeconds).toBe(150)
  })

  test('handles missing step info gracefully', async () => {
    mockJobs = {
      jobs: [
        {
          id: 42,
          name: 'Deploy',
          conclusion: 'failure',
          steps: [],
          started_at: null,
          completed_at: null,
        },
      ],
    }
    mockLogsText = 'error: deploy failed'

    const result = await githubActionsTool.execute(
      { owner: 'my-org', repo: 'api', runId: 456 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal },
    )

    expect(result.jobName).toBe('Deploy')
    expect(result.failedStep).toBeNull()
    expect(result.durationSeconds).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/server && bun test tests/github-actions-tool.test.ts`
Expected: FAIL — module `../src/agent/tools/github-actions` not found

- [ ] **Step 4: Implement the GitHub Actions tool**

Create `apps/server/src/agent/tools/github-actions.ts`:

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { Octokit } from '@octokit/rest'
import { config } from '../../config'

const octokit = new Octokit({ auth: config.github.token })

const MAX_LOG_LINES = 300

export const githubActionsTool = tool({
  description:
    'Fetch GitHub Actions workflow run logs for a failed CI run. ' +
    'Returns the last 300 lines of the failed step logs, the job name, failed step name, and duration.',
  parameters: z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    runId: z.number().describe('The workflow run ID from the webhook payload'),
  }),
  execute: async ({ owner, repo, runId }) => {
    const { data } = await octokit.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: runId,
    })

    const failedJob = data.jobs.find((j) => j.conclusion === 'failure')
    if (!failedJob) {
      return { error: 'No failed job found in this workflow run' }
    }

    const { data: logsData } = await octokit.actions.downloadJobLogsForWorkflowRun({
      owner,
      repo,
      job_id: failedJob.id,
    })

    const rawLogs = typeof logsData === 'string' ? logsData : String(logsData)
    const lines = rawLogs.split('\n')
    const relevant = lines.slice(-MAX_LOG_LINES).join('\n')

    const failedStep = failedJob.steps?.find((s) => s.conclusion === 'failure')?.name ?? null

    const durationSeconds =
      failedJob.completed_at && failedJob.started_at
        ? Math.round((new Date(failedJob.completed_at).getTime() - new Date(failedJob.started_at).getTime()) / 1000)
        : null

    return {
      jobName: failedJob.name,
      failedStep,
      logs: relevant,
      durationSeconds,
    }
  },
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/server && bun test tests/github-actions-tool.test.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 6: Run full test suite**

Run: `cd apps/server && bun test`
Expected: All existing tests still pass

- [ ] **Step 7: Run lint and typecheck**

Run: `cd apps/server && bun run lint && bun run typecheck`

- [ ] **Step 8: Commit and push**

```bash
git add apps/server/src/agent/tools/github-actions.ts apps/server/tests/github-actions-tool.test.ts
git commit -m "feat: add GitHub Actions log fetching tool (#6)"
git push -u origin feat/6-github-actions-tool
```

- [ ] **Step 9: Create PR and merge**

```bash
gh pr create --title "feat: GitHub Actions log fetching tool" --body "Closes #6"
```

Merge after CI passes, then pull main.

---

## Task 2: ReAct Agent Loop (Issue #5)

**Branch:** `feat/5-react-agent-loop` (from main after Task 1 merged)

**Files:**

- Rewrite: `apps/server/src/agent/runner.ts`
- Expand: `apps/server/src/agent/prompts.ts`
- Rewrite: `apps/server/tests/agent.test.ts`

### Steps

- [ ] **Step 1: Create branch from updated main**

```bash
git checkout main && git pull
git checkout -b feat/5-react-agent-loop
```

- [ ] **Step 2: Write the agent system prompt**

Add to `apps/server/src/agent/prompts.ts` (keep existing `CLASSIFY_PROMPT`):

```typescript
export const AGENT_SYSTEM_PROMPT = `You are an incident triage agent for engineering teams.

When a CI/CD failure is reported, your job is to:
1. Call tools to gather evidence — logs, errors, recent deploys
2. Reason across the evidence to identify root cause
3. Stop when you have enough information for a confident assessment

Tool calling strategy:
- Always start with get_workflow_logs — it has the most direct evidence
- If logs mention import/dependency errors, note the specific packages
- If you see a timeout or resource issue, note the duration and limits
- Stop early if evidence clearly points to a single cause

Rules:
- Never hallucinate log content. Quote exactly what you saw.
- If a tool returns an error, note "no data available from [source]" and reason with what you have
- Be specific — mention exact error messages, file paths, line numbers when visible in logs
- Confidence scoring: 0.9 = certain with evidence, 0.7 = strong signal, 0.5 = educated guess, 0.3 = speculation`

export const SYNTHESIS_PROMPT = `You are synthesizing an incident investigation into a structured brief.

You have access to the full investigation conversation including tool results.
Produce a classification with:
- failureType: the category that best fits
- summary: 1-2 sentence description of what happened
- rootCause: specific root cause with evidence (quote log lines if available)
- suggestedFix: an actionable fix — a command, file change, or config value
- confidence: 0.0-1.0 based on evidence quality

If logs were available, your confidence should be higher. If only metadata was available, keep confidence below 0.6.`
```

- [ ] **Step 3: Write the failing test for the new agent runner**

Rewrite `apps/server/tests/agent.test.ts`:

```typescript
import { describe, test, expect, mock, beforeEach } from 'bun:test'

let generateTextCalls: unknown[] = []
let generateObjectCalls: unknown[] = []
let dbUpdates: Record<string, unknown>[] = []
let slackBriefUpdates: { incidentId: string; brief: unknown }[] = []
let slackThreadReplies: { incidentId: string; text: string }[] = []
let toolCallInserts: Record<string, unknown>[] = []
let shouldThrowOnGenerate = false
const mockStepData = {
  toolCalls: [{ toolName: 'get_workflow_logs', args: { owner: 'my-org', repo: 'api', runId: 123 } }],
  toolResults: [
    {
      toolName: 'get_workflow_logs',
      result: { jobName: 'Build', logs: 'TypeError: x is not a function', failedStep: 'Run tests' },
    },
  ],
}
let mockGenerateTextResponse = {
  text: 'Based on the logs, the test failed due to a type error.',
  steps: [mockStepData],
}

mock.module('../src/config', () => ({
  config: {
    github: { token: 'ghp_test', webhook_secret: 'test', repos: ['my-org/api'] },
    llm: { api_key: 'sk-or-test', model: 'anthropic/claude-sonnet-4-5' },
  },
}))

mock.module('drizzle-orm', () => ({
  eq: (_col: unknown, _val: unknown) => ({}),
}))

mock.module('../src/db/client', () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        dbUpdates.push(values)
        return { where: () => Promise.resolve() }
      },
    }),
    insert: () => ({
      values: (val: Record<string, unknown>) => {
        toolCallInserts.push(val)
        return Promise.resolve([val])
      },
    }),
  },
  incidents: { id: 'id' },
  toolCalls: {},
}))

mock.module('../src/slack/message', () => ({
  updateSlackWithBrief: async (incidentId: string, brief: unknown) => {
    slackBriefUpdates.push({ incidentId, brief })
  },
  postThreadReply: async (incidentId: string, text: string) => {
    slackThreadReplies.push({ incidentId, text })
  },
}))

const mockBrief = {
  failureType: 'code_bug' as const,
  summary: 'TypeScript compilation failed due to type error',
  rootCause: 'TypeError in src/auth/login.ts — x is not a function',
  suggestedFix: 'Fix the function call on line 42 of src/auth/login.ts',
  confidence: 0.85,
  similarIncidentId: null,
}

mock.module('ai', () => ({
  generateText: async (opts: {
    onStepFinish?: (step: typeof mockStepData) => Promise<void>
    [key: string]: unknown
  }) => {
    generateTextCalls.push(opts)
    if (shouldThrowOnGenerate) throw new Error('LLM call failed')
    // Invoke onStepFinish callback so tool call logging is exercised
    if (opts.onStepFinish) {
      await opts.onStepFinish(mockStepData)
    }
    return mockGenerateTextResponse
  },
  generateObject: async (opts: unknown) => {
    generateObjectCalls.push(opts)
    return { object: mockBrief }
  },
}))

mock.module('../src/agent/llm', () => ({
  createModel: () => ({ modelId: 'anthropic/claude-sonnet-4-5' }),
}))

mock.module('../src/agent/tools/github-actions', () => ({
  githubActionsTool: {
    description: 'mock tool',
    parameters: {},
    execute: async () => ({ jobName: 'Build', logs: 'error', failedStep: 'test' }),
  },
}))

const { runIncidentAgent } = await import('../src/agent/runner')

const mockIncident = {
  id: 'test-incident-1',
  repo: 'my-org/api',
  branch: 'main',
  commit: 'abc1234def5678',
  workflowName: 'CI / Build & Test',
  workflowRunId: 123,
  failedStep: null,
  status: 'investigating' as const,
  briefJson: null,
  confidence: null,
  rootCause: null,
  suggestedFix: null,
  slackChannel: '#test',
  slackMessageTs: '1234567890.123456',
  triggeredAt: new Date(),
  resolvedAt: null,
  mttrSeconds: null,
  createdAt: new Date(),
}

beforeEach(() => {
  generateTextCalls = []
  generateObjectCalls = []
  dbUpdates = []
  slackBriefUpdates = []
  slackThreadReplies = []
  toolCallInserts = []
  shouldThrowOnGenerate = false
})

describe('Agent Runner — ReAct Loop', () => {
  test('calls generateText for investigation phase', async () => {
    await runIncidentAgent(mockIncident)
    expect(generateTextCalls.length).toBe(1)
  })

  test('calls generateObject for synthesis phase', async () => {
    await runIncidentAgent(mockIncident)
    expect(generateObjectCalls.length).toBe(1)
  })

  test('passes tool results to synthesis phase', async () => {
    await runIncidentAgent(mockIncident)

    const synthCall = generateObjectCalls[0] as { messages: { role: string; content: string }[] }
    expect(synthCall.messages).toBeDefined()
    expect(synthCall.messages.length).toBeGreaterThan(0)
  })

  test('updates DB with brief and status', async () => {
    await runIncidentAgent(mockIncident)

    const update = dbUpdates.find((u) => u.status === 'brief_ready')
    expect(update).toBeDefined()
    expect(update!.rootCause).toBe(mockBrief.rootCause)
    expect(update!.suggestedFix).toBe(mockBrief.suggestedFix)
    expect(update!.confidence).toBe(0.85)
  })

  test('updates Slack with brief', async () => {
    await runIncidentAgent(mockIncident)

    expect(slackBriefUpdates.length).toBe(1)
    expect(slackBriefUpdates[0].incidentId).toBe('test-incident-1')
  })

  test('logs tool calls to DB', async () => {
    await runIncidentAgent(mockIncident)
    expect(toolCallInserts.length).toBeGreaterThan(0)
  })

  test('posts tool trace as thread reply', async () => {
    await runIncidentAgent(mockIncident)
    expect(slackThreadReplies.length).toBeGreaterThan(0)
  })

  test('sets error status on agent failure', async () => {
    shouldThrowOnGenerate = true
    await runIncidentAgent(mockIncident)

    const update = dbUpdates.find((u) => u.status === 'error')
    expect(update).toBeDefined()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/server && bun test tests/agent.test.ts`
Expected: FAIL — `runIncidentAgent` still uses old single-shot approach

- [ ] **Step 5: Implement the ReAct agent runner**

Rewrite `apps/server/src/agent/runner.ts`:

```typescript
import { generateText, generateObject } from 'ai'
import { eq } from 'drizzle-orm'
import { BriefSchema } from '@orchentra/core'
import { db, incidents, toolCalls } from '../db/client'
import { createModel } from './llm'
import { AGENT_SYSTEM_PROMPT, SYNTHESIS_PROMPT } from './prompts'
import { githubActionsTool } from './tools/github-actions'
import { updateSlackWithBrief, postThreadReply } from '../slack/message'

type IncidentRow = typeof incidents.$inferSelect

function formatIncidentContext(incident: IncidentRow): string {
  const [owner, repo] = incident.repo.split('/')
  return [
    `Incident ID: ${incident.id}`,
    `Repository: ${incident.repo}`,
    `Workflow: ${incident.workflowName}`,
    `Branch: ${incident.branch}`,
    `Commit: ${incident.commit}`,
    `Failed step: ${incident.failedStep ?? 'unknown'}`,
    `Workflow run ID: ${incident.workflowRunId}`,
    `Owner: ${owner}`,
    `Repo name: ${repo}`,
    '',
    'Investigate this CI failure. Start by fetching the workflow logs.',
  ].join('\n')
}

export async function runIncidentAgent(incident: IncidentRow): Promise<void> {
  let stepNumber = 0

  try {
    // Phase A: Investigation — generateText with tools
    const result = await generateText({
      model: createModel(),
      system: AGENT_SYSTEM_PROMPT,
      prompt: formatIncidentContext(incident),
      tools: { get_workflow_logs: githubActionsTool },
      maxSteps: 6,
      onStepFinish: async ({ toolCalls: calls, toolResults: results }) => {
        if (!calls || calls.length === 0) return
        stepNumber++
        for (let i = 0; i < calls.length; i++) {
          const call = calls[i]
          await db.insert(toolCalls).values({
            id: crypto.randomUUID(),
            incidentId: incident.id,
            integration: call.toolName,
            round: stepNumber,
            durationMs: null,
            resultJson: results?.[i] ? JSON.stringify(results[i].result) : null,
          })
        }
      },
    })

    // Build conversation history for synthesis — include both tool calls and results
    const investigationMessages = [{ role: 'user' as const, content: formatIncidentContext(incident) }]

    for (const step of result.steps) {
      for (const call of step.toolCalls ?? []) {
        investigationMessages.push({
          role: 'assistant' as const,
          content: `Called ${call.toolName}(${JSON.stringify(call.args)})`,
        })
      }
      for (const toolResult of step.toolResults ?? []) {
        investigationMessages.push({
          role: 'user' as const,
          content: `Tool result (${toolResult.toolName}): ${JSON.stringify(toolResult.result)}`,
        })
      }
    }

    investigationMessages.push({
      role: 'assistant' as const,
      content: result.text,
    })

    // Phase B: Synthesis — generateObject for structured brief
    const { object: brief } = await generateObject({
      model: createModel(),
      schema: BriefSchema,
      system: SYNTHESIS_PROMPT,
      messages: investigationMessages,
    })

    await db
      .update(incidents)
      .set({
        briefJson: JSON.stringify(brief),
        rootCause: brief.rootCause,
        suggestedFix: brief.suggestedFix,
        confidence: brief.confidence,
        status: 'brief_ready',
      })
      .where(eq(incidents.id, incident.id))

    await updateSlackWithBrief(incident.id, brief)

    // Post tool trace as thread reply
    const traceLines = result.steps.flatMap((step) =>
      (step.toolCalls ?? []).map((call) => `\`${call.toolName}\`(${JSON.stringify(call.args)})`),
    )
    if (traceLines.length > 0) {
      await postThreadReply(incident.id, `*Investigation trace:*\n${traceLines.join('\n')}`)
    }

    console.log(`Incident ${incident.id}: ${brief.failureType} (${Math.round(brief.confidence * 100)}%)`)
  } catch (error) {
    console.error(`Agent failed for ${incident.id}:`, error)

    await db
      .update(incidents)
      .set({ status: 'error', rootCause: 'Agent investigation failed — check server logs' })
      .where(eq(incidents.id, incident.id))
  }
}
```

- [ ] **Step 6: Add `postThreadReply` to slack/message.ts**

Add to `apps/server/src/slack/message.ts` (append, do not replace existing functions):

```typescript
export async function postThreadReply(incidentId: string, text: string): Promise<void> {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  })
  if (!incident?.slackMessageTs || !incident.slackChannel) return

  try {
    await slack.chat.postMessage({
      channel: incident.slackChannel,
      thread_ts: incident.slackMessageTs,
      text,
    })
  } catch (error) {
    console.error(`Failed to post thread reply for ${incidentId}:`, error)
  }
}
```

- [ ] **Step 7: Re-export toolCalls from db/client.ts**

The server's `db/client.ts` already re-exports from `@orchentra/db`. Verify `toolCalls` is in the re-export:

```typescript
// apps/server/src/db/client.ts — should already have:
export { db, runMigrations } from '@orchentra/db'
export { incidents, toolCalls, resolvedPatterns } from '@orchentra/db'
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/server && bun test tests/agent.test.ts`
Expected: PASS — all 8 tests green

- [ ] **Step 9: Run full test suite**

Run: `cd apps/server && bun test`
Expected: All tests pass (agent tests may need adjustments based on mock shape)

- [ ] **Step 10: Run lint and typecheck**

Run: `cd apps/server && bun run lint && bun run typecheck`

- [ ] **Step 11: Commit and push**

```bash
git add apps/server/src/agent/runner.ts apps/server/src/agent/prompts.ts apps/server/src/slack/message.ts apps/server/tests/agent.test.ts
git commit -m "feat: ReAct agent loop with multi-step tool calling (#5)"
git push -u origin feat/5-react-agent-loop
```

- [ ] **Step 12: Create PR and merge**

```bash
gh pr create --title "feat: ReAct agent loop with tool calling" --body "Closes #5"
```

---

## Task 3: Block Kit Message Builder (Issue #8)

**Branch:** `feat/8-block-kit-messages` (from main after Task 2 merged)

**Files:**

- Create: `apps/server/src/slack/blocks.ts`
- Update: `apps/server/src/slack/message.ts`
- Create: `apps/server/tests/blocks.test.ts`
- Update: `apps/server/tests/slack-message.test.ts`

### Steps

- [ ] **Step 1: Create branch from updated main**

```bash
git checkout main && git pull
git checkout -b feat/8-block-kit-messages
```

- [ ] **Step 2: Write the failing test for blocks**

Create `apps/server/tests/blocks.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test'
import { buildBlocks } from '../src/slack/blocks'

describe('buildBlocks', () => {
  test('investigating state shows spinner text', () => {
    const blocks = buildBlocks({ status: 'investigating' })

    expect(blocks.length).toBeGreaterThan(0)
    const text = JSON.stringify(blocks)
    expect(text).toContain('Investigating')
  })

  test('brief_ready state includes header, fields, root cause, confidence, fix, and buttons', () => {
    const blocks = buildBlocks({
      status: 'brief_ready',
      brief: {
        failureType: 'code_bug',
        summary: 'Type error in auth module',
        rootCause: 'TypeError in login.ts:42',
        suggestedFix: 'Fix parseInt call',
        confidence: 0.85,
        similarIncidentId: null,
      },
      incident: {
        id: 'inc-1',
        repo: 'my-org/api',
        workflowName: 'CI / Build & Test',
        failedStep: 'Run tests',
        branch: 'main',
        commit: 'abc1234def5678',
      },
    })

    const text = JSON.stringify(blocks)
    expect(text).toContain('CI / Build & Test')
    expect(text).toContain('my-org/api')
    expect(text).toContain('TypeError in login.ts:42')
    expect(text).toContain('Fix parseInt call')
    expect(text).toContain('85%')
    expect(text).toContain('approve_fix')
    expect(text).toContain('dig_deeper')
    expect(text).toContain('snooze')
    expect(text).toContain('false_alarm')
  })

  test('brief_ready buttons have correct action IDs and values', () => {
    const blocks = buildBlocks({
      status: 'brief_ready',
      brief: {
        failureType: 'code_bug',
        summary: 'Test',
        rootCause: 'Test',
        suggestedFix: 'Test',
        confidence: 0.5,
        similarIncidentId: null,
      },
      incident: {
        id: 'inc-1',
        repo: 'org/repo',
        workflowName: 'CI',
        failedStep: null,
        branch: 'main',
        commit: 'abc1234',
      },
    })

    const actionsBlock = blocks.find((b) => b.type === 'actions') as {
      elements: { action_id: string; value: string }[]
    }
    expect(actionsBlock).toBeDefined()
    expect(actionsBlock.elements.length).toBe(4)

    const actionIds = actionsBlock.elements.map((e) => e.action_id)
    expect(actionIds).toContain('approve_fix')
    expect(actionIds).toContain('dig_deeper')
    expect(actionIds).toContain('snooze')
    expect(actionIds).toContain('false_alarm')
  })

  test('fixing state shows approved-by user', () => {
    const blocks = buildBlocks({
      status: 'fixing',
      approvedBy: 'jdoe',
      action: 'Re-running workflow',
    })

    const text = JSON.stringify(blocks)
    expect(text).toContain('jdoe')
    expect(text).toContain('Re-running workflow')
  })

  test('resolved state shows MTTR', () => {
    const blocks = buildBlocks({
      status: 'resolved',
      incident: {
        workflowName: 'CI / Build',
        suggestedFix: 'Fixed the type error',
        mttrSeconds: 150,
      },
    })

    const text = JSON.stringify(blocks)
    expect(text).toContain('Resolved')
    expect(text).toContain('2m 30s')
  })

  test('confidence bar renders correctly', () => {
    const blocks = buildBlocks({
      status: 'brief_ready',
      brief: {
        failureType: 'unknown',
        summary: 'Test',
        rootCause: 'Test',
        suggestedFix: 'Test',
        confidence: 0.3,
        similarIncidentId: null,
      },
      incident: {
        id: 'inc-1',
        repo: 'org/repo',
        workflowName: 'CI',
        failedStep: null,
        branch: 'main',
        commit: 'abc1234',
      },
    })

    const text = JSON.stringify(blocks)
    expect(text).toContain('30%')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/server && bun test tests/blocks.test.ts`
Expected: FAIL — module `../src/slack/blocks` not found

- [ ] **Step 4: Implement the Block Kit builder**

Create `apps/server/src/slack/blocks.ts`:

```typescript
import type { IncidentBrief } from '@orchentra/core'
import { formatMttr } from '@orchentra/core'

interface IncidentFields {
  id: string
  repo: string
  workflowName: string
  failedStep: string | null
  branch: string
  commit: string
}

interface ResolvedFields {
  workflowName: string
  suggestedFix: string | null
  mttrSeconds: number | null
}

export type MessageState =
  | { status: 'investigating' }
  | { status: 'brief_ready'; brief: IncidentBrief; incident: IncidentFields }
  | { status: 'fixing'; approvedBy: string; action: string }
  | { status: 'resolved'; incident: ResolvedFields }

// Use a generic block type compatible with Slack's API — the SDK accepts Record<string, unknown>[]
// for the blocks parameter alongside its own KnownBlock[] type
type SlackBlock = Record<string, unknown>

export function buildBlocks(state: MessageState): SlackBlock[] {
  switch (state.status) {
    case 'investigating':
      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Investigating...* fetching logs and errors.',
          },
        },
      ]

    case 'brief_ready': {
      const { brief, incident } = state
      const confidencePct = Math.round(brief.confidence * 100)
      const filled = Math.round(brief.confidence * 10)
      const confidenceBar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled)

      return [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${incident.workflowName} -- ${incident.repo}` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Workflow*\n${incident.workflowName}` },
            { type: 'mrkdwn', text: `*Failed step*\n${incident.failedStep ?? 'unknown'}` },
            { type: 'mrkdwn', text: `*Branch*\n\`${incident.branch}\`` },
            { type: 'mrkdwn', text: `*Commit*\n\`${incident.commit.slice(0, 7)}\`` },
          ],
        },
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Root cause*\n${brief.rootCause}` },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Confidence: \`${confidenceBar}\` ${confidencePct}%`,
            },
          ],
        },
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Suggested fix*\n${brief.suggestedFix}` },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Re-run with fix' },
              style: 'primary',
              action_id: 'approve_fix',
              value: incident.id,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Dig deeper' },
              action_id: 'dig_deeper',
              value: incident.id,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Snooze 1h' },
              action_id: 'snooze',
              value: JSON.stringify({ incidentId: incident.id, minutes: 60 }),
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'False alarm' },
              style: 'danger',
              action_id: 'false_alarm',
              value: incident.id,
            },
          ],
        },
      ]
    }

    case 'fixing':
      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Fixing...* approved by @${state.approvedBy}\n${state.action}`,
          },
        },
      ]

    case 'resolved': {
      const mttrText = formatMttr(state.incident.mttrSeconds)
      return [
        {
          type: 'header',
          text: { type: 'plain_text', text: `Resolved -- ${state.incident.workflowName}` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*MTTR*\n${mttrText}` },
            { type: 'mrkdwn', text: `*Fix applied*\n${state.incident.suggestedFix ?? 'Manual resolution'}` },
          ],
        },
      ]
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/server && bun test tests/blocks.test.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 6: Update slack/message.ts to use Block Kit**

Modify `apps/server/src/slack/message.ts`:

- `postInitialSlackMessage`: add `blocks: buildBlocks({ status: 'investigating' })`
- `updateSlackWithBrief`: add `blocks: buildBlocks({ status: 'brief_ready', brief, incident })`
- Keep `text` field as fallback (Slack requires it)

Replace the body of `postInitialSlackMessage`:

```typescript
const blocks = buildBlocks({ status: 'investigating' })
const res = await slack.chat.postMessage({
  channel: config.delivery.slack.channel,
  text: `CI failure in ${incident.repo} — ${incident.workflowName}. Investigating...`,
  blocks,
})
```

Replace the `try { await slack.chat.update(...)` block in `updateSlackWithBrief` (keep the existing null-check guard `if (!incident?.slackMessageTs || !incident.slackChannel) return`):

```typescript
const blocks = buildBlocks({
  status: 'brief_ready',
  brief,
  incident: {
    id: incident.id,
    repo: incident.repo,
    workflowName: incident.workflowName,
    failedStep: incident.failedStep,
    branch: incident.branch,
    commit: incident.commit,
  },
})
const fallbackText = `CI failure in ${incident.repo} — ${brief.rootCause}`
await slack.chat.update({
  channel: incident.slackChannel!,
  ts: incident.slackMessageTs,
  text: fallbackText,
  blocks,
})
```

Also add a generic `updateSlackMessage` function:

```typescript
export async function updateSlackMessage(incidentId: string, state: Parameters<typeof buildBlocks>[0]): Promise<void> {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  })
  if (!incident?.slackMessageTs || !incident.slackChannel) return

  try {
    await slack.chat.update({
      channel: incident.slackChannel,
      ts: incident.slackMessageTs,
      text: `Incident ${incidentId} — ${state.status}`,
      blocks: buildBlocks(state),
    })
  } catch (error) {
    console.error(`Failed to update Slack message for ${incidentId}:`, error)
  }
}
```

Import `buildBlocks` at the top of `message.ts`.

- [ ] **Step 7: Update slack-message.test.ts for Block Kit**

Update `apps/server/tests/slack-message.test.ts`:

1. Add a mock for `../src/slack/blocks` that returns a stable known value:

```typescript
mock.module('../src/slack/blocks', () => ({
  buildBlocks: () => [{ type: 'section', text: { type: 'mrkdwn', text: 'mock block' } }],
}))
```

2. Update the mock Slack client to capture `blocks` alongside `text`:

```typescript
postMessage: async (opts: { channel: string; text: string; blocks?: unknown[] }) => {
  postedMessages.push(opts)
  return { ok: true, ts: '1234567890.123456' }
},
update: async (opts: { channel: string; ts: string; text: string; blocks?: unknown[] }) => {
  updatedMessages.push(opts)
  return { ok: true }
},
```

3. Add assertions in `postInitialSlackMessage` test:

```typescript
expect(postedMessages[0].blocks).toBeDefined()
expect(postedMessages[0].blocks!.length).toBeGreaterThan(0)
```

4. Add assertions in `updateSlackWithBrief` test:

```typescript
expect(updatedMessages[0].blocks).toBeDefined()
```

- [ ] **Step 8: Run full test suite**

Run: `cd apps/server && bun test`
Expected: All tests pass

- [ ] **Step 9: Run lint and typecheck**

Run: `cd apps/server && bun run lint && bun run typecheck`

- [ ] **Step 10: Commit and push**

```bash
git add apps/server/src/slack/blocks.ts apps/server/src/slack/message.ts apps/server/tests/blocks.test.ts apps/server/tests/slack-message.test.ts
git commit -m "feat: Block Kit message builder with action buttons (#8)"
git push -u origin feat/8-block-kit-messages
```

- [ ] **Step 11: Create PR and merge**

```bash
gh pr create --title "feat: Block Kit messages with action buttons" --body "Closes #8"
```

---

## Task 4: Slack Interaction Handler (Issue #9)

**Branch:** `feat/9-slack-interactions` (from main after Task 3 merged)

**Files:**

- Rewrite: `apps/server/src/routes/interactions.ts`
- Create: `apps/server/tests/interactions.test.ts`

### Steps

- [ ] **Step 1: Create branch from updated main**

```bash
git checkout main && git pull
git checkout -b feat/9-slack-interactions
```

- [ ] **Step 2: Write the failing test**

Create `apps/server/tests/interactions.test.ts`:

```typescript
import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createHmac } from 'crypto'

const SIGNING_SECRET = 'test-slack-signing-secret'
let dbUpdates: Record<string, unknown>[] = []
let slackMessageUpdates: { incidentId: string; state: unknown }[] = []
let slackThreadReplies: { incidentId: string; text: string }[] = []

mock.module('../src/config', () => ({
  config: {
    delivery: {
      slack: {
        bot_token: 'xoxb-test',
        signing_secret: SIGNING_SECRET,
        channel: '#test',
      },
    },
  },
}))

mock.module('drizzle-orm', () => ({
  eq: (_col: unknown, _val: unknown) => ({}),
}))

mock.module('../src/db/client', () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        dbUpdates.push(values)
        return { where: () => Promise.resolve() }
      },
    }),
    query: {
      incidents: {
        findFirst: async () => ({
          id: 'inc-1',
          status: 'brief_ready',
          triggeredAt: new Date('2026-03-24T10:00:00Z'),
          slackChannel: '#test',
          slackMessageTs: '123.456',
        }),
      },
    },
  },
  incidents: { id: 'id' },
}))

mock.module('../src/slack/message', () => ({
  updateSlackMessage: async (incidentId: string, state: unknown) => {
    slackMessageUpdates.push({ incidentId, state })
  },
  postThreadReply: async (incidentId: string, text: string) => {
    slackThreadReplies.push({ incidentId, text })
  },
}))

const { interactionsRouter } = await import('../src/routes/interactions')
import { Hono } from 'hono'

function makeApp(): Hono {
  const app = new Hono()
  app.route('/slack/interactions', interactionsRouter)
  return app
}

function signPayload(body: string, timestamp: number): string {
  const sigBase = `v0:${timestamp}:${body}`
  return 'v0=' + createHmac('sha256', SIGNING_SECRET).update(sigBase).digest('hex')
}

function makeInteractionPayload(actionId: string, value: string, user = 'testuser'): string {
  return JSON.stringify({
    type: 'block_actions',
    user: { id: 'U123', username: user },
    actions: [{ action_id: actionId, value }],
    trigger_id: 'trigger-1',
  })
}

async function sendInteraction(
  app: ReturnType<typeof makeApp>,
  actionId: string,
  value: string,
  opts: { user?: string; badSignature?: boolean } = {},
): Promise<Response> {
  const payload = makeInteractionPayload(actionId, value, opts.user)
  const timestamp = Math.floor(Date.now() / 1000)
  const body = `payload=${encodeURIComponent(payload)}`
  const signature = opts.badSignature ? 'v0=invalid' : signPayload(body, timestamp)

  return app.request('/slack/interactions/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-slack-signature': signature,
      'x-slack-request-timestamp': String(timestamp),
    },
    body,
  })
}

beforeEach(() => {
  dbUpdates = []
  slackMessageUpdates = []
  slackThreadReplies = []
})

describe('Slack Interactions — Signature Verification', () => {
  test('rejects invalid signature', async () => {
    const app = makeApp()
    const res = await sendInteraction(app, 'approve_fix', 'inc-1', { badSignature: true })
    expect(res.status).toBe(401)
  })

  test('accepts valid signature', async () => {
    const app = makeApp()
    const res = await sendInteraction(app, 'approve_fix', 'inc-1')
    expect(res.status).toBe(200)
  })
})

describe('Slack Interactions — Action Handling', () => {
  test('approve_fix updates status to fixing', async () => {
    const app = makeApp()
    await sendInteraction(app, 'approve_fix', 'inc-1')
    await Bun.sleep(100)

    const update = dbUpdates.find((u) => u.status === 'fixing')
    expect(update).toBeDefined()
  })

  test('approve_fix posts thread reply with user', async () => {
    const app = makeApp()
    await sendInteraction(app, 'approve_fix', 'inc-1', { user: 'jdoe' })
    await Bun.sleep(100)

    const reply = slackThreadReplies.find((r) => r.text.includes('jdoe'))
    expect(reply).toBeDefined()
  })

  test('false_alarm updates status to dismissed', async () => {
    const app = makeApp()
    await sendInteraction(app, 'false_alarm', 'inc-1')
    await Bun.sleep(100)

    const update = dbUpdates.find((u) => u.status === 'dismissed')
    expect(update).toBeDefined()
  })

  test('snooze updates status to snoozed', async () => {
    const app = makeApp()
    const snoozeValue = JSON.stringify({ incidentId: 'inc-1', minutes: 60 })
    await sendInteraction(app, 'snooze', snoozeValue)
    await Bun.sleep(100)

    const update = dbUpdates.find((u) => u.status === 'snoozed')
    expect(update).toBeDefined()
  })

  test('snooze posts thread reply', async () => {
    const app = makeApp()
    const snoozeValue = JSON.stringify({ incidentId: 'inc-1', minutes: 60 })
    await sendInteraction(app, 'snooze', snoozeValue, { user: 'jdoe' })
    await Bun.sleep(100)

    const reply = slackThreadReplies.find((r) => r.text.includes('jdoe') && r.text.includes('snoozed'))
    expect(reply).toBeDefined()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/server && bun test tests/interactions.test.ts`
Expected: FAIL — interactions handler is still a stub

- [ ] **Step 4: Implement the interactions handler**

Rewrite `apps/server/src/routes/interactions.ts`:

```typescript
import { Hono } from 'hono'
import { createHmac, timingSafeEqual } from 'crypto'
import { eq } from 'drizzle-orm'
import { config } from '../config'
import { db, incidents } from '../db/client'
import { updateSlackMessage, postThreadReply } from '../slack/message'

export const interactionsRouter = new Hono()

function verifySlackSignature(body: string, timestamp: string, signature: string): boolean {
  const sigBase = `v0:${timestamp}:${body}`
  const expected = 'v0=' + createHmac('sha256', config.delivery.slack.signing_secret).update(sigBase).digest('hex')

  const sigBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expected)

  if (sigBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(sigBuf, expectedBuf)
}

interface SlackAction {
  action_id: string
  value: string
}

interface SlackInteractionPayload {
  type: string
  user: { id: string; username: string }
  actions: SlackAction[]
  trigger_id: string
}

interactionsRouter.post('/', async (c) => {
  const body = await c.req.text()
  const timestamp = c.req.header('x-slack-request-timestamp') ?? ''
  const signature = c.req.header('x-slack-signature') ?? ''

  if (!verifySlackSignature(body, timestamp, signature)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const params = new URLSearchParams(body)
  const payloadStr = params.get('payload')
  if (!payloadStr) return c.json({ error: 'Missing payload' }, 400)

  const payload: SlackInteractionPayload = JSON.parse(payloadStr)

  // Acknowledge immediately — Slack requires response < 3 seconds
  handleInteraction(payload).catch(console.error)

  return c.json({})
})

async function handleInteraction(payload: SlackInteractionPayload): Promise<void> {
  const action = payload.actions[0]
  if (!action) return

  const { action_id: actionId, value } = action
  const user = payload.user.username

  switch (actionId) {
    case 'approve_fix': {
      await db.update(incidents).set({ status: 'fixing' }).where(eq(incidents.id, value))

      await updateSlackMessage(value, {
        status: 'fixing',
        approvedBy: user,
        action: 'Re-running workflow with suggested fix',
      })

      await postThreadReply(value, `@${user} approved auto-fix — re-run triggered`)
      break
    }

    case 'dig_deeper': {
      await postThreadReply(value, `@${user} requested deeper investigation — running additional analysis`)
      // Future: re-run agent with broadened scope
      break
    }

    case 'snooze': {
      const { incidentId, minutes } = JSON.parse(value)
      await db.update(incidents).set({ status: 'snoozed' }).where(eq(incidents.id, incidentId))

      await postThreadReply(incidentId, `@${user} snoozed for ${minutes}m`)
      break
    }

    case 'false_alarm': {
      const incident = await db.query.incidents.findFirst({
        where: eq(incidents.id, value),
      })

      const mttrSeconds = incident?.triggeredAt
        ? Math.round((Date.now() - new Date(incident.triggeredAt).getTime()) / 1000)
        : null

      await db
        .update(incidents)
        .set({
          status: 'dismissed',
          resolvedAt: new Date(),
          mttrSeconds,
        })
        .where(eq(incidents.id, value))

      await postThreadReply(value, `@${user} marked as false alarm`)
      break
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/server && bun test tests/interactions.test.ts`
Expected: PASS — all 6 tests green

- [ ] **Step 6: Run full test suite**

Run: `cd apps/server && bun test`
Expected: All tests pass

- [ ] **Step 7: Run lint and typecheck**

Run: `cd apps/server && bun run lint && bun run typecheck`

- [ ] **Step 8: Commit and push**

```bash
git add apps/server/src/routes/interactions.ts apps/server/tests/interactions.test.ts
git commit -m "feat: Slack interaction handler for button actions (#9)"
git push -u origin feat/9-slack-interactions
```

- [ ] **Step 9: Create PR and merge**

```bash
gh pr create --title "feat: Slack interaction handler for button actions" --body "Closes #9"
```

---

## Post-Phase 2 Verification

After all 4 PRs are merged:

- [ ] Pull main: `git checkout main && git pull`
- [ ] Run full test suite: `cd apps/server && bun test`
- [ ] Run typecheck: `cd apps/server && bun run typecheck`
- [ ] Run lint: `cd apps/server && bun run lint`
- [ ] Manual test with `bun run apps/server/scripts/test-webhook.ts` — verify Block Kit message appears in Slack

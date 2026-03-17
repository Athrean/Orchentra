# Orchentra — Phase-wise MVP Plan

> Bootstrap to launch: GitHub Actions + Slack-native AI incident triage, fully open source

---

## Product vision

Orchentra is an open source AI agent that investigates CI/CD failures and production incidents automatically. When a GitHub Actions workflow fails, the agent fetches logs, queries observability tools, reasons about root cause using an LLM ReAct loop, and delivers a structured brief — with action buttons — into a Slack thread within 30 seconds. The human's only job is to read the brief and click one button.

**The core bet:** most engineering toil during an incident is information gathering, not decision-making. The agent handles gathering. The human handles deciding.

**Distribution strategy:** open source first, developer-led adoption. Teams add it to a repo, it works, they tell their team. No sales, no enterprise onboarding. Cloud-hosted version funds development.

---

## Tech stack

| Layer             | Choice                                         | Reason                                                                                  |
| ----------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Runtime           | Bun                                            | Fast installs, native TypeScript, built-in HTTP server, great for I/O-heavy agent loops |
| Web framework     | Hono                                           | Lightweight, runs natively on Bun, ideal for webhook + API routes                       |
| Frontend          | Next.js 15 (App Router)                        | Dashboard UI, landing page, server components for fast initial loads                    |
| Styling           | Tailwind CSS + shadcn/ui                       | Fast UI with consistent component primitives, no design decisions needed                |
| Database          | SQLite (dev) → PostgreSQL via Supabase (cloud) | Zero-setup self-hosting, Drizzle handles migration between them seamlessly              |
| ORM               | Drizzle ORM                                    | Type-safe, migration-first, works identically on SQLite and Postgres                    |
| LLM orchestration | Vercel AI SDK                                  | Model-agnostic, built-in tool calling, streaming, works with Claude + OpenAI            |
| LLM model         | `claude-sonnet-4-5`                            | Best tool use reliability, long context for log analysis, fast enough for real-time     |
| Auth (cloud)      | Supabase Auth                                  | Google OAuth for hosted version, not needed for self-hosted                             |
| Queue             | BullMQ + Redis (optional) or in-memory queue   | Incident processing is async, queue prevents webhook timeouts                           |
| Monorepo          | Bun workspaces                                 | No extra tooling, native to Bun                                                         |
| Containerisation  | Docker + docker-compose                        | Self-host in one command                                                                |
| CI/CD             | GitHub Actions                                 | Dogfooding — the product monitors itself                                                |

---

## Repository structure

```
Orchentra/
├── apps/
│   ├── server/                   # Hono on Bun — webhook ingestor + API
│   │   ├── src/
│   │   │   ├── index.ts          # Hono app entry
│   │   │   ├── routes/
│   │   │   │   ├── webhooks.ts   # /webhooks/github, /webhooks/slack
│   │   │   │   ├── interactions.ts # /slack/interactions (button clicks)
│   │   │   │   ├── commands.ts   # /slack/commands (/pilot ...)
│   │   │   │   └── api.ts        # /api/* for dashboard
│   │   │   ├── agent/
│   │   │   │   ├── runner.ts     # ReAct loop
│   │   │   │   ├── planner.ts    # which tools to call
│   │   │   │   ├── synthesizer.ts # build brief from tool results
│   │   │   │   └── prompts.ts    # all system prompts
│   │   │   ├── integrations/
│   │   │   │   ├── index.ts      # registry
│   │   │   │   ├── github-actions.ts
│   │   │   │   ├── sentry.ts
│   │   │   │   └── datadog.ts
│   │   │   ├── slack/
│   │   │   │   ├── client.ts     # Slack Web API wrapper
│   │   │   │   ├── blocks.ts     # all Block Kit builders
│   │   │   │   ├── message.ts    # updateIncidentMessage state machine
│   │   │   │   └── home.ts       # App Home tab
│   │   │   └── db/
│   │   │       ├── schema.ts     # Drizzle schema
│   │   │       └── client.ts     # DB connection
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                      # Next.js — dashboard + landing page
│       ├── app/
│       │   ├── page.tsx          # landing page
│       │   ├── dashboard/
│       │   │   ├── page.tsx      # incident list
│       │   │   ├── [id]/
│       │   │   │   └── page.tsx  # incident detail + trace
│       │   └── settings/
│       │       └── page.tsx      # credential manager
│       ├── components/
│       └── package.json
│
├── packages/
│   ├── core/                     # shared types + logic
│   │   ├── src/
│   │   │   ├── types.ts          # IncidentBrief, Integration, etc.
│   │   │   └── utils.ts
│   │   └── package.json
│   └── db/                       # shared Drizzle schema
│       ├── src/
│       │   ├── schema.ts
│       │   └── migrations/
│       └── package.json
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── Orchentra.yml.example     # the 5-line config
├── Dockerfile
├── bun.workspace                 # Bun workspace config
└── README.md
```

---

## Configuration contract

The entire self-hosted setup is one YAML file. No UI, no database migrations, no OAuth flows for the first run:

```yaml
# Orchentra.yml

github:
  webhook_secret: 'your-webhook-secret'
  token: 'ghp_xxx' # for fetching logs + posting PR comments
  repos:
    - 'my-org/api'
    - 'my-org/frontend'

llm:
  provider: 'anthropic' # or "openai"
  api_key: 'sk-ant-xxx'
  model: 'claude-sonnet-4-5' # optional override

integrations:
  sentry:
    auth_token: 'sntryu_xxx'
    org: 'my-org'
  datadog: # optional
    api_key: 'xxx'
    app_key: 'xxx'

delivery:
  slack:
    bot_token: 'xoxb-xxx' # Bot User OAuth Token
    signing_secret: 'xxx' # for verifying payloads
    channel: '#incidents'
    app_token: 'xapp-xxx' # for Socket Mode (optional)
  github_comments: true # also post on PR
```

---

## Integration plugin interface

Every integration is a single TypeScript file exporting this contract. This is the contribution surface for the community:

```typescript
// packages/core/src/types.ts

export interface IncidentContext {
  id: string
  repo: string
  branch: string
  commit: string
  workflowName: string
  failedStep: string
  triggeredAt: Date
  rawPayload: Record<string, unknown>
}

export interface DataFragment {
  source: string // "github-actions" | "sentry" | ...
  summary: string // plain text for LLM context
  raw: Record<string, unknown> // full data for storage
  relevanceSignals: string[] // ["recent_deploy", "new_error_class"]
}

export interface Integration {
  id: string
  name: string
  category: 'ci' | 'observability' | 'alerting' | 'cloud' | 'comms'

  // LLM calls this to decide if this integration is worth querying
  // Return 0.0–1.0. Above 0.6 gets called.
  relevance(ctx: IncidentContext): Promise<number>

  // The actual data fetch
  fetch(ctx: IncidentContext): Promise<DataFragment>

  // Zod schema for credential validation
  credentialSchema: z.ZodSchema
}
```

A community integration for CircleCI would be one 60-line file. Nothing else changes.

---

## Database schema

```typescript
// packages/db/src/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const incidents = sqliteTable('incidents', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  branch: text('branch').notNull(),
  commit: text('commit').notNull(),
  workflowName: text('workflow_name').notNull(),
  failedStep: text('failed_step'),
  status: text('status').notNull().default('investigating'),
  // "investigating" | "brief_ready" | "fixing" | "resolved" | "snoozed" | "dismissed"

  // LLM output
  briefJson: text('brief_json'), // JSON stringified IncidentBrief
  confidence: real('confidence'),
  rootCause: text('root_cause'),
  suggestedFix: text('suggested_fix'),

  // Slack
  slackChannel: text('slack_channel'),
  slackMessageTs: text('slack_message_ts'), // for chat.update

  // Timing
  triggeredAt: integer('triggered_at', { mode: 'timestamp' }),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  mttrSeconds: integer('mttr_seconds'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const toolCalls = sqliteTable('tool_calls', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').references(() => incidents.id),
  integration: text('integration').notNull(),
  round: integer('round').notNull(),
  durationMs: integer('duration_ms'),
  resultJson: text('result_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const resolvedPatterns = sqliteTable('resolved_patterns', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id'),
  embedding: text('embedding'), // JSON array for similarity search
  pattern: text('pattern'),
  resolution: text('resolution'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
```

---

---

# Phase 1 — Bootstrap (Days 1–3)

> Goal: CI failure → message appears in Slack. Accuracy doesn't matter yet.

## What you're building

The skeleton: webhook receiver → queue → LLM call → Slack post. No integrations, no Block Kit. Just text. By end of Day 3 you should see a Slack message appear within seconds of a GitHub Actions failure.

## Day 1 — Webhook receiver

Set up the Bun + Hono server. Register the GitHub webhook. Verify the signature. Log the payload to confirm it's working.

```typescript
// apps/server/src/routes/webhooks.ts
import { Hono } from 'hono'
import { createHmac } from 'crypto'

export const webhooksRouter = new Hono()

webhooksRouter.post('/github', async (c) => {
  const body = await c.req.text()
  const sig = c.req.header('x-hub-signature-256') ?? ''

  // Always verify first
  const expected = 'sha256=' + createHmac('sha256', config.github.webhookSecret).update(body).digest('hex')

  if (sig !== expected) return c.json({ error: 'Unauthorized' }, 401)

  const event = c.req.header('x-github-event')
  const payload = JSON.parse(body)

  // Only care about workflow_run failures in MVP
  if (event === 'workflow_run' && payload.action === 'completed' && payload.workflow_run.conclusion === 'failure') {
    // Don't await — acknowledge GitHub immediately
    processWorkflowFailure(payload).catch(console.error)
  }

  return c.json({ ok: true })
})

async function processWorkflowFailure(payload: GitHubWorkflowPayload) {
  const incident = await db
    .insert(incidents)
    .values({
      id: crypto.randomUUID(),
      repo: payload.repository.full_name,
      branch: payload.workflow_run.head_branch,
      commit: payload.workflow_run.head_sha,
      workflowName: payload.workflow_run.name,
      status: 'investigating',
      triggeredAt: new Date(payload.workflow_run.created_at),
      createdAt: new Date(),
    })
    .returning()

  // Post "Investigating..." to Slack immediately
  await postInitialSlackMessage(incident[0])

  // Run agent async
  await runIncidentAgent(incident[0])
}
```

## Day 2 — First LLM call

No ReAct loop yet. Just: give LLM the alert, get a basic classification back.

```typescript
// apps/server/src/agent/runner.ts
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

const BriefSchema = z.object({
  failureType: z.enum(['flaky_test', 'env_missing', 'dependency_conflict', 'infra_timeout', 'code_bug', 'unknown']),
  summary: z.string(),
  likelyCause: z.string(),
  suggestedFix: z.string(),
  confidence: z.number().min(0).max(1),
})

export async function runIncidentAgent(incident: Incident): Promise<void> {
  // Phase 1: just classification, no tool calls yet
  const { object: brief } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    schema: BriefSchema,
    system: CLASSIFY_PROMPT,
    prompt: `
      Repo: ${incident.repo}
      Workflow: ${incident.workflowName}
      Branch: ${incident.branch}
      Commit: ${incident.commit}
      Failed step: ${incident.failedStep ?? 'unknown'}

      Classify this CI failure and suggest a fix.
    `,
  })

  await db
    .update(incidents)
    .set({
      briefJson: JSON.stringify(brief),
      rootCause: brief.likelyCause,
      suggestedFix: brief.suggestedFix,
      confidence: brief.confidence,
      status: 'brief_ready',
    })
    .where(eq(incidents.id, incident.id))

  await updateSlackMessage(incident.id, { status: 'brief_ready', brief })
}
```

## Day 3 — Slack message (plain text first)

```typescript
// apps/server/src/slack/message.ts
import { WebClient } from '@slack/web-api'

const slack = new WebClient(config.slack.botToken)

export async function postInitialSlackMessage(incident: Incident) {
  const res = await slack.chat.postMessage({
    channel: config.slack.channel,
    text: `🔴 CI failure in ${incident.repo} · ${incident.workflowName} · investigating...`,
  })

  await db
    .update(incidents)
    .set({ slackMessageTs: res.ts, slackChannel: config.slack.channel })
    .where(eq(incidents.id, incident.id))
}

export async function updateSlackMessage(incidentId: string, state: MessageState) {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  })
  if (!incident?.slackMessageTs) return

  const text = buildFallbackText(state)

  await slack.chat.update({
    channel: incident.slackChannel!,
    ts: incident.slackMessageTs,
    text,
  })
}
```

**End of Phase 1 checkpoint:** push a commit that breaks a GitHub Actions step. A Slack message appears with the repo name and a basic failure classification. It's ugly but it works.

---

---

# Phase 2 — The Real Agent (Days 4–7)

> Goal: ReAct loop with GitHub Actions + Sentry tool calls. Brief is accurate and useful.

## What you're building

The actual intelligence. The LLM now has tools — it fetches real log data from GitHub, real errors from Sentry, and reasons across both. Block Kit messages with buttons replace the plain text.

## The ReAct loop

The agent runs a loop: think → call tool → observe result → think again → call another tool or stop. Max 6 rounds to keep cost and latency predictable.

```typescript
// apps/server/src/agent/runner.ts (Phase 2 — full ReAct)
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

export async function runIncidentAgent(incident: Incident): Promise<void> {
  const messages: CoreMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: formatIncidentContext(incident) },
  ]

  const toolCallLog: ToolCallRecord[] = []
  let round = 0

  while (round < 6) {
    const { text, toolCalls, toolResults, finishReason } = await generateText({
      model: anthropic('claude-sonnet-4-5'),
      messages,
      tools: buildToolSet(incident), // registered integrations as AI SDK tools
      maxSteps: 1, // one tool call per round for clean logging
    })

    // Log each tool call for the trace UI
    for (const call of toolCalls ?? []) {
      const record = await saveToolCall(incident.id, call, round)
      toolCallLog.push(record)
    }

    messages.push({ role: 'assistant', content: text })
    if (toolResults?.length) {
      messages.push({ role: 'tool', content: toolResults })
    }

    // Model decided it has enough info
    if (finishReason === 'stop' || !toolCalls?.length) break

    round++
  }

  // Final synthesis pass — structured output from the full conversation
  const brief = await synthesizeBrief(messages, incident)

  await db
    .update(incidents)
    .set({
      status: 'brief_ready',
      briefJson: JSON.stringify(brief),
      rootCause: brief.rootCause,
      suggestedFix: brief.suggestedFix,
      confidence: brief.confidence,
    })
    .where(eq(incidents.id, incident.id))

  await updateSlackMessage(incident.id, { status: 'brief_ready', brief })
  await postThreadReply(incident.id, { type: 'tool_trace', calls: toolCallLog })
}
```

## The system prompt

This is the most important file in the codebase. Tune it every day:

```typescript
// apps/server/src/agent/prompts.ts

export const AGENT_SYSTEM_PROMPT = `
You are an incident triage agent for engineering teams.

When a CI/CD failure or production incident is reported, your job is to:
1. Call tools to gather evidence — logs, errors, recent deploys, past incidents
2. Reason across the evidence to identify root cause
3. Produce a clear, actionable brief with a confidence score

Tool calling strategy:
- Always start with get_workflow_logs — it has the most direct evidence
- If logs show import/dependency errors, call get_recent_errors next
- If you see a recent deploy in the last 30 minutes, that is almost always the cause
- Call search_incident_history to check if this pattern has occurred before
- Stop when confidence > 0.80 OR after 5 tool calls — whichever comes first

Output rules:
- Never hallucinate log content. Quote exactly what you saw.
- If a tool returns no data, say "no data available from [source]"
- Confidence = 0.9 means you're certain. 0.5 means you're guessing.
- Suggested fix must be specific — a command, a file change, a config value.
  Bad: "check the dependencies". Good: "pin stripe to v2.8.1 in package.json"

Format your final analysis before calling synthesize_brief:
  ROOT CAUSE: [one sentence]
  EVIDENCE: [bullet points from tool results]
  FIX: [specific action]
  CONFIDENCE: [0.0-1.0]
  SIMILAR_INCIDENT: [id if found, else "none"]
`
```

## GitHub Actions integration

```typescript
// apps/server/src/integrations/github-actions.ts
import { tool } from 'ai'
import { z } from 'zod'
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: config.github.token })

export const githubActionsTool = tool({
  description:
    'Fetch GitHub Actions workflow run logs for a failed CI run. ' +
    "Returns the last 300 lines of the failed step's logs.",
  parameters: z.object({
    repo: z.string().describe('owner/repo format'),
    runId: z.number().describe('The workflow run ID from the webhook payload'),
  }),
  execute: async ({ repo, runId }) => {
    const [owner, repoName] = repo.split('/')

    // Get jobs to find the failed one
    const { data: jobs } = await octokit.actions.listJobsForWorkflowRun({
      owner,
      repo: repoName,
      run_id: runId,
    })

    const failedJob = jobs.jobs.find((j) => j.conclusion === 'failure')
    if (!failedJob) return { error: 'No failed job found' }

    // Get logs
    const { data: logsUrl } = await octokit.actions.downloadJobLogsForWorkflowRun({
      owner,
      repo: repoName,
      job_id: failedJob.id,
    })

    const logsResponse = await fetch(logsUrl as unknown as string)
    const rawLogs = await logsResponse.text()

    // Return last 300 lines to keep context window manageable
    const lines = rawLogs.split('\n')
    const relevant = lines.slice(-300).join('\n')

    return {
      jobName: failedJob.name,
      failedStep: failedJob.steps?.find((s) => s.conclusion === 'failure')?.name,
      logs: relevant,
      duration:
        failedJob.completed_at && failedJob.started_at
          ? Math.round((new Date(failedJob.completed_at).getTime() - new Date(failedJob.started_at).getTime()) / 1000)
          : null,
    }
  },
})
```

## Sentry integration

```typescript
// apps/server/src/integrations/sentry.ts
import { tool } from 'ai'
import { z } from 'zod'

export const sentryTool = tool({
  description:
    'Fetch recent errors from Sentry for a specific project. ' + 'Returns new error classes seen in the last 2 hours.',
  parameters: z.object({
    project: z.string().describe('Sentry project slug'),
    since: z.string().describe('ISO timestamp — look for errors after this time'),
  }),
  execute: async ({ project, since }) => {
    const res = await fetch(
      `https://sentry.io/api/0/projects/${config.sentry.org}/${project}/issues/` +
        `?query=firstSeen:>${since}&sort=date&limit=10`,
      { headers: { Authorization: `Bearer ${config.sentry.authToken}` } },
    )

    if (!res.ok) return { error: `Sentry API error: ${res.status}` }

    const issues = await res.json()

    return {
      newIssues: issues.map((i: SentryIssue) => ({
        title: i.title,
        count: i.count,
        firstSeen: i.firstSeen,
        culprit: i.culprit,
        level: i.level,
      })),
      totalNew: issues.length,
    }
  },
})
```

## Block Kit message builder

```typescript
// apps/server/src/slack/blocks.ts

type MessageState =
  | { status: 'investigating' }
  | { status: 'brief_ready'; brief: IncidentBrief; incident: Incident }
  | { status: 'fixing'; approvedBy: string; action: string }
  | { status: 'resolved'; incident: Incident }

export function buildBlocks(state: MessageState): KnownBlock[] {
  switch (state.status) {
    case 'investigating':
      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:hourglass_flowing_sand: *Investigating...* fetching logs and errors. This takes ~25 seconds.`,
          },
        },
      ]

    case 'brief_ready': {
      const { brief, incident } = state
      const confidencePct = Math.round(brief.confidence * 100)
      const confidenceBar =
        '█'.repeat(Math.round(brief.confidence * 10)) + '░'.repeat(10 - Math.round(brief.confidence * 10))

      return [
        // Header
        {
          type: 'header',
          text: { type: 'plain_text', text: `🔴  ${incident.workflowName} · ${incident.repo}` },
        },
        // Key fields
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Workflow*\n${incident.workflowName}` },
            { type: 'mrkdwn', text: `*Failed step*\n${incident.failedStep ?? 'unknown'}` },
            { type: 'mrkdwn', text: `*Branch*\n\`${incident.branch}\`` },
            { type: 'mrkdwn', text: `*Commit*\n${incident.commit.slice(0, 7)}` },
          ],
        },
        { type: 'divider' },
        // Root cause
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Root cause*\n${brief.rootCause}` },
        },
        // Confidence
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text:
                `Confidence: \`${confidenceBar}\` ${confidencePct}%` +
                (brief.similarIncidentId
                  ? `  ·  Similar to <${incident.dashboardUrl}|incident #${brief.similarIncidentId}>`
                  : ''),
            },
          ],
        },
        { type: 'divider' },
        // Suggested fix
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Suggested fix*\n${brief.suggestedFix}` },
        },
        // Action buttons
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
            text: `:wrench: *Fixing...* approved by @${state.approvedBy}\n${state.action}`,
          },
        },
      ]

    case 'resolved': {
      const mttr = state.incident.mttrSeconds
      const mttrText = mttr ? (mttr < 60 ? `${mttr}s` : `${Math.round(mttr / 60)}m ${mttr % 60}s`) : 'unknown'

      return [
        {
          type: 'header',
          text: { type: 'plain_text', text: `✅  Resolved · ${state.incident.workflowName}` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*MTTR*\n${mttrText}` },
            { type: 'mrkdwn', text: `*Fix applied*\n${state.incident.suggestedFix}` },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Postmortem draft ready in thread ↓`,
            },
          ],
        },
      ]
    }
  }
}
```

## Interactions endpoint (button clicks)

```typescript
// apps/server/src/routes/interactions.ts

interactionsRouter.post('/', async (c) => {
  const body = await c.req.formData()
  const payload = JSON.parse(body.get('payload') as string) as SlackInteractionPayload

  if (!verifySlackSignature(c.req.raw, config.slack.signingSecret)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Acknowledge immediately — Slack requires response < 3 seconds
  const ack = c.json({})

  // Process async
  handleInteraction(payload).catch(console.error)

  return ack
})

async function handleInteraction(payload: SlackInteractionPayload) {
  const action = payload.actions[0]
  const { action_id, value } = action
  const userId = payload.user.username

  switch (action_id) {
    case 'approve_fix': {
      const incidentId = value
      await updateIncidentMessage(incidentId, {
        status: 'fixing',
        approvedBy: userId,
        action: 'Re-running workflow with suggested fix',
      })
      await postThreadReply(incidentId, {
        type: 'action_log',
        text: `@${userId} approved auto-fix · re-run triggered`,
      })
      await executeApprovedFix(incidentId)
      break
    }

    case 'dig_deeper': {
      await runAdditionalInvestigation(value, { broadenScope: true })
      break
    }

    case 'snooze': {
      const { incidentId, minutes } = JSON.parse(value)
      await snoozeIncident(incidentId, minutes)
      await postThreadReply(incidentId, {
        type: 'action_log',
        text: `@${userId} snoozed for ${minutes / 60}h`,
      })
      break
    }

    case 'false_alarm': {
      const incidentId = value
      await resolveIncident(incidentId, 'false_alarm')
      break
    }
  }
}
```

**End of Phase 2 checkpoint:** a real GitHub Actions failure produces a Slack message with the actual root cause quoted from logs, a confidence score, and working action buttons. Click "False alarm" — the message updates. Click "Dig deeper" — a thread reply appears.

---

---

# Phase 3 — Dashboard UI + Landing Page (Days 8–12)

> Goal: visual home for the product. Incident history, trace viewer, settings.

## What you're building

Three Next.js pages. The dashboard is secondary to Slack — it's for history, audit, and settings. The landing page is distribution infrastructure.

## Landing page

One page. No sections the developer has to scroll through before seeing code. Hero → demo GIF → 5-line setup → integration badges.

```tsx
// apps/web/app/page.tsx

export default function LandingPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-20">
      {/* Hero */}
      <h1 className="text-4xl font-medium tracking-tight text-zinc-900 mb-4">
        Your CI fails. Orchentra
        <br />
        investigates.
      </h1>
      <p className="text-xl text-zinc-500 mb-8">
        AI agent that reads your GitHub Actions logs, queries Sentry, and posts a root cause brief in Slack — in 30
        seconds. Open source. Self-host in one command.
      </p>

      {/* Demo GIF */}
      <div className="rounded-xl border border-zinc-200 overflow-hidden mb-12">
        <img src="/demo.gif" alt="Orchentra demo" className="w-full" />
      </div>

      {/* Setup code */}
      <h2 className="text-lg font-medium text-zinc-900 mb-4">Set up in 60 seconds</h2>
      <pre className="bg-zinc-950 text-zinc-100 rounded-xl p-6 text-sm mb-12 overflow-x-auto">
        <code>
          {`git clone https://github.com/your-org/Orchentra
cp Orchentra.yml.example Orchentra.yml
# fill in your GitHub token, Slack bot token, Anthropic key
docker compose up`}
        </code>
      </pre>

      {/* Integrations */}
      <h2 className="text-lg font-medium text-zinc-900 mb-4">Integrations</h2>
      <div className="flex flex-wrap gap-2 mb-12">
        {integrations.map((i) => (
          <span
            key={i.name}
            className={cn(
              'px-3 py-1 rounded-full text-sm border',
              i.status === 'stable'
                ? 'bg-green-50 text-green-800 border-green-200'
                : 'bg-zinc-50 text-zinc-500 border-zinc-200',
            )}
          >
            {i.name}
            {i.status === 'coming_soon' && ' (soon)'}
          </span>
        ))}
      </div>

      {/* CTA */}
      <div className="flex gap-3">
        <a
          href="https://github.com/your-org/Orchentra"
          className="px-5 py-2.5 bg-zinc-900 text-white rounded-lg text-sm font-medium"
        >
          Star on GitHub
        </a>
        <a
          href="/dashboard"
          className="px-5 py-2.5 border border-zinc-200 text-zinc-700 rounded-lg text-sm font-medium"
        >
          Try hosted version
        </a>
      </div>
    </main>
  )
}
```

## Incident list (dashboard home)

```tsx
// apps/web/app/dashboard/page.tsx

export default async function DashboardPage() {
  const incidents = await db.query.incidents.findMany({
    orderBy: [desc(incidents.createdAt)],
    limit: 50,
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Incidents</h1>
        <StatusSummary incidents={incidents} />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 text-zinc-400 text-left">
            <th className="pb-3 font-normal">Repo</th>
            <th className="pb-3 font-normal">Workflow</th>
            <th className="pb-3 font-normal">Status</th>
            <th className="pb-3 font-normal">Confidence</th>
            <th className="pb-3 font-normal">MTTR</th>
            <th className="pb-3 font-normal">When</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => (
            <tr
              key={incident.id}
              className="border-b border-zinc-50 hover:bg-zinc-50 cursor-pointer"
              onClick={() => router.push(`/dashboard/${incident.id}`)}
            >
              <td className="py-3 font-mono text-xs">{incident.repo}</td>
              <td className="py-3">{incident.workflowName}</td>
              <td className="py-3">
                <StatusBadge status={incident.status} />
              </td>
              <td className="py-3">
                <ConfidenceBar value={incident.confidence} />
              </td>
              <td className="py-3">{formatMttr(incident.mttrSeconds)}</td>
              <td className="py-3 text-zinc-400">{timeAgo(incident.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

## Incident detail — tool call trace

The trace view is what builds engineer trust. Show exactly what the agent queried, what it got back, and why it reached its conclusion.

```tsx
// apps/web/app/dashboard/[id]/page.tsx

export default async function IncidentDetailPage({ params }: { params: { id: string } }) {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, params.id),
  })
  const calls = await db.query.toolCalls.findMany({
    where: eq(toolCalls.incidentId, params.id),
    orderBy: [asc(toolCalls.round)],
  })

  const brief = incident.briefJson ? JSON.parse(incident.briefJson) : null

  return (
    <div className="max-w-3xl mx-auto p-6">
      <IncidentHeader incident={incident} />

      {/* The brief */}
      {brief && (
        <div className="border border-zinc-200 rounded-xl p-6 mb-6">
          <div className="text-sm font-medium text-zinc-400 mb-1 uppercase tracking-wide">Root cause</div>
          <div className="text-zinc-900 mb-4">{brief.rootCause}</div>
          <div className="text-sm font-medium text-zinc-400 mb-1 uppercase tracking-wide">Suggested fix</div>
          <div className="text-zinc-900 font-mono text-sm bg-zinc-50 p-3 rounded-lg">{brief.suggestedFix}</div>
          <ConfidenceBar value={incident.confidence} showLabel className="mt-4" />
        </div>
      )}

      {/* Tool call trace */}
      <div className="mb-2 text-sm font-medium text-zinc-900">
        Agent trace · {calls.length} tool calls · {incident.agentDurationMs}ms
      </div>
      <div className="space-y-3">
        {calls.map((call, i) => (
          <div key={call.id} className="border border-zinc-100 rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-50 border-b border-zinc-100">
              <span className="text-xs text-zinc-400">Round {call.round + 1}</span>
              <span className="text-sm font-medium font-mono">{call.integration}</span>
              <span className="ml-auto text-xs text-zinc-400">{call.durationMs}ms</span>
            </div>
            <div className="px-4 py-3">
              <pre className="text-xs text-zinc-600 whitespace-pre-wrap">
                {JSON.stringify(JSON.parse(call.resultJson ?? '{}'), null, 2)}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**End of Phase 3 checkpoint:** the landing page is live. A developer who finds the repo can go from zero to their first Slack alert in under 5 minutes. The dashboard shows incident history and lets engineers inspect what the agent actually did.

---

---

# Phase 4 — Slash Commands + App Home (Days 13–15)

> Goal: complete Slack-native experience. No dashboard required for daily use.

## Slash commands

Register `/pilot` in the Slack app manifest. All subcommands handled in one route:

```typescript
// apps/server/src/routes/commands.ts

commandsRouter.post('/', async (c) => {
  const body = await c.req.formData()
  const command = body.get('command') as string
  const text = ((body.get('text') as string) ?? '').trim()
  const userId = body.get('user_id') as string
  const channelId = body.get('channel_id') as string

  if (!verifySlackSignature(c.req.raw, config.slack.signingSecret)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Acknowledge immediately
  const response = c.json({ response_type: 'ephemeral', text: 'Loading...' })

  handleCommand({ text, userId, channelId }).catch(console.error)

  return response
})

async function handleCommand({ text, userId, channelId }: CommandContext) {
  const [subcommand, ...args] = text.split(' ')

  switch (subcommand) {
    case 'status': {
      const open = await db.query.incidents.findMany({
        where: and(eq(incidents.slackChannel, channelId), notInArray(incidents.status, ['resolved', 'dismissed'])),
      })
      await slack.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: open.length
          ? `${open.length} open incident(s):\n${open
              .map((i) => `• ${i.workflowName} · ${i.status} · <${i.dashboardUrl}|view>`)
              .join('\n')}`
          : 'No open incidents. All clear.',
      })
      break
    }

    case 'history': {
      const recent = await db.query.incidents.findMany({
        where: eq(incidents.status, 'resolved'),
        orderBy: [desc(incidents.resolvedAt)],
        limit: 10,
      })
      // Post formatted history...
      break
    }

    case 'snooze': {
      const duration = args[0] ?? '1h'
      const minutes = parseSnoozeArg(duration)
      const active = await getActiveIncident(channelId)
      if (active) {
        await snoozeIncident(active.id, minutes)
        await postEphemeral(channelId, userId, `Snoozed for ${duration}.`)
      }
      break
    }

    case 'ask': {
      // Natural language query against active incident
      const question = args.join(' ')
      const active = await getActiveIncident(channelId)
      if (!active) {
        await postEphemeral(channelId, userId, 'No active incident to ask about.')
        break
      }
      const answer = await answerQuestion(active, question)
      await postEphemeral(channelId, userId, answer)
      break
    }
  }
}
```

## App Home tab

Published when a user opens the app in the Slack sidebar. Gives a clean dashboard inside Slack:

```typescript
// apps/server/src/slack/home.ts

// Register this in your Slack event handler:
// slack.event("app_home_opened", async ({ event }) => {
//   await publishHomeTab(event.user)
// })

export async function publishHomeTab(userId: string) {
  const recentIncidents = await db.query.incidents.findMany({
    orderBy: [desc(incidents.createdAt)],
    limit: 5,
  })

  const openCount = recentIncidents.filter((i) => !['resolved', 'dismissed'].includes(i.status)).length

  const avgMttr =
    recentIncidents.filter((i) => i.mttrSeconds).reduce((sum, i) => sum + i.mttrSeconds!, 0) /
    recentIncidents.filter((i) => i.mttrSeconds).length

  await slack.views.publish({
    user_id: userId,
    view: {
      type: 'home',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Orchentra' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Open incidents*\n${openCount}` },
            { type: 'mrkdwn', text: `*Avg MTTR (7d)*\n${formatMttr(avgMttr)}` },
          ],
        },
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '*Recent incidents*' },
        },
        ...recentIncidents.map((i) => ({
          type: 'section' as const,
          text: {
            type: 'mrkdwn' as const,
            text: `*${i.workflowName}* · ${i.repo}\n${i.rootCause ?? 'Investigating...'} · ${timeAgo(i.createdAt)}`,
          },
          accessory: {
            type: 'button' as const,
            text: { type: 'plain_text' as const, text: 'View' },
            url: `${config.dashboardUrl}/dashboard/${i.id}`,
            action_id: `view_incident_${i.id}`,
          },
        })),
      ],
    },
  })
}
```

**End of Phase 4 checkpoint:** engineers never need to leave Slack. `/pilot status` shows open incidents. `/pilot ask what's the error rate?` returns a real answer. The App Home tab gives a clean overview when they click the bot in the sidebar.

---

---

# Phase 5 — Postmortems + OSS Launch (Days 16–21)

> Goal: full incident lifecycle complete. Launch publicly.

## Postmortem generation

After every resolved incident, generate a draft postmortem from the agent's tool call history. Engineers edit it, not write it:

```typescript
// apps/server/src/agent/postmortem.ts

export async function generatePostmortem(incidentId: string): Promise<string> {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  })
  const calls = await db.query.toolCalls.findMany({
    where: eq(toolCalls.incidentId, incidentId),
    orderBy: [asc(toolCalls.round)],
  })

  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    system: `You generate blameless incident postmortems.
      Be specific. Use the evidence from the tool calls.
      Follow this exact format:

      ## What happened
      [2-3 sentences. Timeline of events.]

      ## Root cause
      [One clear sentence.]

      ## Impact
      [Duration, who was affected, what was degraded.]

      ## Fix applied
      [Exact change made.]

      ## Action items
      - [ ] [Specific preventive action]
      - [ ] [Monitoring improvement]
    `,
    prompt: `
      Incident: ${incident.workflowName} in ${incident.repo}
      Duration: ${formatMttr(incident.mttrSeconds)}
      Root cause: ${incident.rootCause}
      Fix: ${incident.suggestedFix}

      Evidence gathered:
      ${calls.map((c) => `[${c.integration}]: ${JSON.parse(c.resultJson ?? '{}').summary ?? 'no summary'}`).join('\n')}
    `,
  })

  return text
}
```

Post the draft as a thread reply on resolution:

```typescript
// In resolveIncident():
const postmortem = await generatePostmortem(incidentId)
await postThreadReply(incidentId, {
  type: 'postmortem',
  content: postmortem,
})
```

## OSS launch checklist

Before making the repo public:

```
Repository
  ✓ README — hero, demo GIF, 60-second setup, integration table
  ✓ CONTRIBUTING.md — plugin interface walkthrough, example integration
  ✓ CODE_OF_CONDUCT.md
  ✓ LICENSE (MIT)
  ✓ .github/ISSUE_TEMPLATE/ — bug report, feature request, new integration
  ✓ .github/PULL_REQUEST_TEMPLATE.md

Documentation
  ✓ docs/integrations.md — full integration interface reference
  ✓ docs/self-hosting.md — Docker, env vars, Slack app setup step by step
  ✓ docs/slack-setup.md — exact Slack app manifest, required OAuth scopes
  ✓ docs/configuration.md — every config key documented

Quality
  ✓ CI pipeline using Orchentra itself (dogfooding)
  ✓ Unit tests for buildBlocks(), relevance scoring, config loading
  ✓ Integration tests for GitHub + Sentry tool calls (mocked)
  ✓ docker-compose up works from a clean clone in <2 minutes
```

## Slack app manifest (save as `slack-manifest.yml`)

```yaml
display_information:
  name: Orchentra
  description: AI incident triage for engineering teams
  background_color: '#1a1a2e'

features:
  app_home:
    home_tab_enabled: true
    messages_tab_enabled: false
  slash_commands:
    - command: /pilot
      url: https://your-domain.com/slack/commands
      description: Interact with Orchentra
      usage_hint: '[status|history|snooze|ask]'
      should_escape: false
  bot_user:
    display_name: Orchentra
    always_online: true

oauth_config:
  scopes:
    bot:
      - chat:write
      - chat:write.public
      - commands
      - app_mentions:read

settings:
  event_subscriptions:
    request_url: https://your-domain.com/slack/events
    bot_events:
      - app_home_opened
  interactivity:
    is_enabled: true
    request_url: https://your-domain.com/slack/interactions
```

---

---

# Phase checkpoints summary

| Phase                   | Days  | Ships                                          | Success signal                        |
| ----------------------- | ----- | ---------------------------------------------- | ------------------------------------- |
| 1 — Bootstrap           | 1–3   | Webhook → plain Slack message                  | Any CI failure shows up in Slack      |
| 2 — Real agent          | 4–7   | ReAct loop + GitHub + Sentry tools + Block Kit | Brief is accurate, buttons work       |
| 3 — Dashboard + landing | 8–12  | Next.js dashboard, landing page, trace view    | Someone not on your team sets it up   |
| 4 — Slack-native        | 13–15 | Slash commands, App Home, thread replies       | Engineers operate entirely from Slack |
| 5 — Launch              | 16–21 | Postmortems, OSS launch, ProductHunt           | First GitHub star from a stranger     |

---

# What not to build in MVP

These are explicitly out of scope until you have real users asking for them:

- Multi-LLM model switching (ship Anthropic, add others on request)
- Auto-remediation without human approval (too risky, not needed for trust-building)
- RBAC / team permissions (single workspace is fine for MVP)
- Alertmanager / PagerDuty inbound (GitHub Actions first, always)
- Mobile app or native desktop
- SLA tracking or compliance reports
- Multi-region / HA deployment (single container is fine)

---

# Self-hosting instructions (ship these in README)

```bash
# 1. Clone
git clone https://github.com/your-org/Orchentra
cd Orchentra

# 2. Configure
cp Orchentra.yml.example Orchentra.yml
# Edit Orchentra.yml with your tokens

# 3. Run
docker compose up -d

# 4. Expose webhook (local dev)
npx localtunnel --port 3001 --subdomain Orchentra
# or use ngrok

# 5. Add webhook to GitHub repo
# Settings → Webhooks → Add webhook
# URL: https://Orchentra.loca.lt/webhooks/github
# Content type: application/json
# Secret: (from your Orchentra.yml)
# Events: Workflow runs
```

---

# Contribution guide (for CONTRIBUTING.md)

The fastest way to add a new integration:

```typescript
// Copy apps/server/src/integrations/sentry.ts
// Rename to your-tool.ts
// Implement the Integration interface
// Add to apps/server/src/integrations/index.ts registry
// Open a PR — that's it

// Minimum viable integration:
export const myToolIntegration: Integration = {
  id: 'my-tool',
  name: 'My Tool',
  category: 'observability',

  async relevance(ctx) {
    // Return 0.8 if this tool is likely relevant, 0.1 if not
    return ctx.failedStep?.includes('test') ? 0.8 : 0.3
  },

  async fetch(ctx) {
    const data = await callMyToolApi(ctx.repo, ctx.triggeredAt)
    return {
      source: 'my-tool',
      summary: `Found ${data.errors.length} new errors since deploy`,
      raw: data,
      relevanceSignals: data.errors.length > 0 ? ['new_errors'] : [],
    }
  },

  credentialSchema: z.object({
    apiKey: z.string(),
    orgSlug: z.string(),
  }),
}
```

Adding a working integration takes ~30 minutes for any tool with a REST API.

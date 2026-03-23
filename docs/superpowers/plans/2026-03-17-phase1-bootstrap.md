# Phase 1 — Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CI failure on GitHub Actions → incident created in SQLite → classified by Claude → plain-text Slack message posted and updated with results. End-to-end in <30 seconds.

**Architecture:** Hono webhook route verifies GitHub signature, inserts incident row, fires async pipeline: post "investigating..." to Slack, call Claude `generateObject` for classification, update incident + Slack message with brief. Config loaded from `orchentra.yml` at startup via Zod-validated singleton.

**Tech Stack:** Bun, Hono, Drizzle ORM + SQLite, Vercel AI SDK + @ai-sdk/anthropic, @slack/web-api, js-yaml, Zod

---

## Chunk 1: Config Loader + DB Client

### Task 1: Config Loader

**Files:**

- Create: `apps/server/src/config.ts`

- [ ] **Step 1: Create config schema and loader**

```typescript
// apps/server/src/config.ts
import { readFileSync } from 'fs'
import { load } from 'js-yaml'
import { z } from 'zod'

const ConfigSchema = z.object({
  github: z.object({
    webhook_secret: z.string(),
    token: z.string(),
    repos: z.array(z.string()),
  }),
  llm: z.object({
    provider: z.enum(['anthropic', 'openai']).default('anthropic'),
    api_key: z.string(),
    model: z.string().default('claude-sonnet-4-5'),
  }),
  integrations: z
    .object({
      sentry: z
        .object({
          auth_token: z.string(),
          org: z.string(),
        })
        .optional(),
      datadog: z
        .object({
          api_key: z.string(),
          app_key: z.string(),
        })
        .optional(),
    })
    .optional(),
  delivery: z.object({
    slack: z.object({
      bot_token: z.string(),
      signing_secret: z.string(),
      channel: z.string(),
      app_token: z.string().optional(),
    }),
    github_comments: z.boolean().default(false),
  }),
})

export type Config = z.infer<typeof ConfigSchema>

function loadConfig(): Config {
  const configPath = process.env.ORCHENTRA_CONFIG ?? 'orchentra.yml'
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf-8')
  } catch {
    throw new Error(
      `Config file not found: ${configPath}. Copy orchentra.yml.example to orchentra.yml and fill in your credentials.`,
    )
  }
  const parsed = load(raw)
  return ConfigSchema.parse(parsed)
}

export const config = loadConfig()
```

- [ ] **Step 2: Wire config into server entry**

Update `apps/server/src/index.ts` to import config at top level so it fails fast on bad config.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/index.ts
git commit -m "feat: add config loader with YAML parsing and Zod validation"
```

---

### Task 2: DB Client Wiring

**Files:**

- Modify: `apps/server/src/db/client.ts`

- [ ] **Step 1: Wire DB client re-export**

```typescript
// apps/server/src/db/client.ts
export { db } from '@orchentra/db'
export { incidents, toolCalls, resolvedPatterns } from '@orchentra/db'
```

- [ ] **Step 2: Generate initial Drizzle migration**

```bash
cd packages/db && bun run generate
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/db/client.ts packages/db/src/migrations/
git commit -m "feat: wire DB client and generate initial migration"
```

---

## Chunk 2: GitHub Webhook Receiver

### Task 3: Webhook Handler

**Files:**

- Modify: `apps/server/src/routes/webhooks.ts`

- [ ] **Step 1: Implement webhook with signature verification and incident creation**

```typescript
// apps/server/src/routes/webhooks.ts
import { Hono } from 'hono'
import { createHmac, timingSafeEqual } from 'crypto'
import { config } from '../config'
import { db, incidents } from '../db/client'
import { eq } from 'drizzle-orm'
import { runIncidentAgent } from '../agent/runner'
import { postInitialSlackMessage } from '../slack/message'

export const webhooksRouter = new Hono()

webhooksRouter.post('/github', async (c) => {
  const body = await c.req.text()
  const sig = c.req.header('x-hub-signature-256') ?? ''

  // Verify HMAC-SHA256 signature
  const expected = 'sha256=' + createHmac('sha256', config.github.webhook_secret).update(body).digest('hex')

  const sigBuffer = Buffer.from(sig)
  const expectedBuffer = Buffer.from(expected)
  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const event = c.req.header('x-github-event')
  const payload = JSON.parse(body)

  // Only care about workflow_run failures
  if (event === 'workflow_run' && payload.action === 'completed' && payload.workflow_run?.conclusion === 'failure') {
    // Deduplicate on workflow_run_id
    const existing = await db.query.incidents.findFirst({
      where: eq(incidents.workflowRunId, payload.workflow_run.id),
    })
    if (!existing) {
      processWorkflowFailure(payload).catch(console.error)
    }
  }

  return c.json({ ok: true })
})

async function processWorkflowFailure(payload: Record<string, any>) {
  const run = payload.workflow_run
  const id = crypto.randomUUID()

  const [incident] = await db
    .insert(incidents)
    .values({
      id,
      repo: payload.repository.full_name,
      branch: run.head_branch,
      commit: run.head_sha,
      workflowName: run.name,
      workflowRunId: run.id,
      failedStep: null, // will be populated by agent
      status: 'investigating',
      triggeredAt: new Date(run.created_at),
      createdAt: new Date(),
    })
    .returning()

  // Post "investigating..." to Slack
  await postInitialSlackMessage(incident)

  // Run LLM classification async
  await runIncidentAgent(incident)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/routes/webhooks.ts
git commit -m "feat: GitHub webhook receiver with HMAC signature verification"
```

---

## Chunk 3: Slack Notifications

### Task 4: Slack Client + Message Lifecycle

**Files:**

- Modify: `apps/server/src/slack/client.ts`
- Modify: `apps/server/src/slack/message.ts`

- [ ] **Step 1: Implement Slack client wrapper**

```typescript
// apps/server/src/slack/client.ts
import { WebClient } from '@slack/web-api'
import { config } from '../config'

export const slack = new WebClient(config.delivery.slack.bot_token)
```

- [ ] **Step 2: Implement message posting and updating**

```typescript
// apps/server/src/slack/message.ts
import { eq } from 'drizzle-orm'
import { slack } from './client'
import { config } from '../config'
import { db, incidents } from '../db/client'
import type { IncidentBrief } from '@orchentra/core'

type IncidentRow = typeof incidents.$inferSelect

export async function postInitialSlackMessage(incident: IncidentRow) {
  const res = await slack.chat.postMessage({
    channel: config.delivery.slack.channel,
    text: `🔴 CI failure in *${incident.repo}* · ${incident.workflowName} on \`${incident.branch}\` · investigating...`,
  })

  await db
    .update(incidents)
    .set({ slackMessageTs: res.ts, slackChannel: config.delivery.slack.channel })
    .where(eq(incidents.id, incident.id))
}

export async function updateSlackWithBrief(incidentId: string, brief: IncidentBrief) {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  })
  if (!incident?.slackMessageTs) return

  const confidencePct = Math.round(brief.confidence * 100)
  const text = [
    `🔴 *CI failure* · ${incident.repo} · ${incident.workflowName}`,
    `*Branch:* \`${incident.branch}\` · *Commit:* \`${incident.commit.slice(0, 7)}\``,
    '',
    `*Type:* ${brief.failureType.replace(/_/g, ' ')}`,
    `*Root cause:* ${brief.rootCause}`,
    `*Suggested fix:* ${brief.suggestedFix}`,
    `*Confidence:* ${confidencePct}%`,
    '',
    brief.summary,
  ].join('\n')

  await slack.chat.update({
    channel: incident.slackChannel!,
    ts: incident.slackMessageTs,
    text,
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/slack/client.ts apps/server/src/slack/message.ts
git commit -m "feat: Slack notification lifecycle — post and update messages"
```

---

## Chunk 4: LLM Agent (Classification)

### Task 5: Agent Runner + Prompts

**Files:**

- Modify: `apps/server/src/agent/runner.ts`
- Modify: `apps/server/src/agent/prompts.ts`

- [ ] **Step 1: Write classification prompt**

```typescript
// apps/server/src/agent/prompts.ts
export const CLASSIFY_PROMPT = `You are an AI that classifies CI/CD failures for engineering teams.

Given information about a failed GitHub Actions workflow run, classify the failure and suggest a fix.

Rules:
- Be specific in your root cause analysis — mention exact error types, package names, or config keys when possible
- Suggested fix must be actionable — a command, file change, or config value. Not "check the logs".
- Confidence: 0.9 = very certain, 0.5 = educated guess, 0.3 = low confidence speculation
- If you don't have enough information to classify, set failureType to "unknown" and confidence below 0.4

Failure types:
- flaky_test: Non-deterministic test failure (timing, network, random seed)
- env_missing: Missing environment variable or secret
- dependency_conflict: Version mismatch, lockfile drift, broken dependency
- infra_timeout: Build/deploy timeout, resource exhaustion
- code_bug: Actual code error (syntax, type, logic)
- unknown: Cannot determine from available information`
```

- [ ] **Step 2: Implement agent runner with generateObject**

```typescript
// apps/server/src/agent/runner.ts
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { eq } from 'drizzle-orm'
import { BriefSchema } from '@orchentra/core'
import { config } from '../config'
import { db, incidents } from '../db/client'
import { CLASSIFY_PROMPT } from './prompts'
import { updateSlackWithBrief } from '../slack/message'

type IncidentRow = typeof incidents.$inferSelect

export async function runIncidentAgent(incident: IncidentRow): Promise<void> {
  try {
    // Set ANTHROPIC_API_KEY for the AI SDK
    process.env.ANTHROPIC_API_KEY = config.llm.api_key

    const { object: brief } = await generateObject({
      model: anthropic(config.llm.model),
      schema: BriefSchema,
      system: CLASSIFY_PROMPT,
      prompt: `
Repo: ${incident.repo}
Workflow: ${incident.workflowName}
Branch: ${incident.branch}
Commit: ${incident.commit}
Failed step: ${incident.failedStep ?? 'unknown'}

Classify this CI failure and suggest a fix.
      `.trim(),
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

    console.log(`✅ Incident ${incident.id} classified: ${brief.failureType} (${Math.round(brief.confidence * 100)}%)`)
  } catch (error) {
    console.error(`❌ Agent failed for incident ${incident.id}:`, error)

    // Update status to indicate failure but don't crash
    await db
      .update(incidents)
      .set({ status: 'brief_ready', rootCause: 'Agent classification failed — check server logs' })
      .where(eq(incidents.id, incident.id))
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/agent/runner.ts apps/server/src/agent/prompts.ts
git commit -m "feat: LLM-based failure classification with structured output"
```

---

## Chunk 5: Server Wiring + Verification

### Task 6: Wire Everything Together

**Files:**

- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Update server entry to import config and run migration**

The server should import config (fails fast on bad config), and push the schema to SQLite on startup.

- [ ] **Step 2: Create a test script to simulate a webhook payload**

Create `apps/server/scripts/test-webhook.ts` that sends a mock `workflow_run` failure payload to `http://localhost:3001/webhooks/github` with a valid HMAC signature.

- [ ] **Step 3: Verify health check works**

```bash
curl http://localhost:3001/health
```

- [ ] **Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: Phase 1 complete — webhook → classify → Slack pipeline"
```

# Phase 2 Design: ReAct Loop + GitHub Actions Tool + Block Kit + Interactions

## Summary

Replace the single-shot `generateObject` classification with a multi-round ReAct agent loop that fetches real GitHub Actions logs before classifying failures. Add rich Block Kit Slack messages with action buttons and implement the interaction handler for those buttons.

## Scope

**In scope:**

- ReAct agent loop using AI SDK `generateText` with `maxSteps: 6`
- `get_workflow_logs` tool — fetches failed job logs via Octokit
- Tool call logging to `toolCalls` DB table
- Agent system prompt with tool-calling strategy
- Block Kit message builder for all message states (investigating, brief_ready, fixing, resolved)
- Slack interaction handler for button clicks (approve fix, dig deeper, snooze, false alarm)
- Thread reply support for action logs and tool traces

**Out of scope:**

- Sentry/Datadog integrations (later)
- Slash commands and App Home (Phase 4)
- Dashboard API (Phase 3)
- Auto-remediation execution (approve_fix marks status only — no actual re-run yet)

## Architecture

### 1. Agent Runner (`apps/server/src/agent/runner.ts`)

**Current:** Single `generateObject` call → structured brief.

**New:** Two-phase approach:

```
Phase A: Investigation (generateText + tools)
  - System prompt instructs the agent on tool-calling strategy
  - Tools: get_workflow_logs (more tools added in future phases)
  - maxSteps: 6 — SDK handles the loop automatically
  - onStepFinish callback logs each tool call to DB
  - Agent stops when it has enough info (finishReason: 'stop')

Phase B: Synthesis (generateObject)
  - Takes the full conversation history from Phase A
  - Produces structured IncidentBrief via BriefSchema
  - Separate call ensures clean structured output
```

**Why two phases:** `generateText` with tools gives the agent freedom to reason and call tools. `generateObject` with a Zod schema ensures the final brief is always well-structured. Combining them in one call risks the model stopping tool use prematurely to produce the object.

**Key implementation detail:** Use AI SDK's `onStepFinish` callback to log tool calls:

```typescript
const result = await generateText({
  model: createModel(),
  system: AGENT_SYSTEM_PROMPT,
  prompt: formatIncidentContext(incident),
  tools: { get_workflow_logs: githubActionsTool },
  maxSteps: 6,
  onStepFinish: async ({ toolCalls, toolResults }) => {
    // Log each tool call to DB for the trace UI
  },
})
```

### 2. GitHub Actions Tool (`apps/server/src/agent/tools/github-actions.ts`)

Single AI SDK tool: `get_workflow_logs`

**Parameters:**

- `owner`: string — repo owner (extracted from `repo` field)
- `repo`: string — repo name
- `runId`: number — workflow run ID from webhook payload

**Behavior:**

1. `octokit.actions.listJobsForWorkflowRun` — find the failed job
2. `octokit.actions.downloadJobLogsForWorkflowRun` — get logs for failed job
3. Return last 300 lines of logs + failed step name + job duration

**Error handling:** If no failed job found or API errors, return an error object (not throw). The agent sees the error as tool output and reasons about it.

**Auth:** Uses `config.github.token` from orchentra.yml.

### 3. Agent System Prompt (`apps/server/src/agent/prompts.ts`)

Replace `CLASSIFY_PROMPT` with `AGENT_SYSTEM_PROMPT` that includes:

- Role: incident triage agent
- Tool-calling strategy: always start with `get_workflow_logs`
- Output rules: never hallucinate, quote exact log lines, confidence scoring guidance
- Stop conditions: confidence > 0.8 OR all tools exhausted

Keep `CLASSIFY_PROMPT` as a fallback for when the agent has no tools available.

### 4. Block Kit Message Builder (`apps/server/src/slack/blocks.ts`)

New file. Pure function: `buildBlocks(state: MessageState) => KnownBlock[]`

**Four states:**

| State           | Display                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `investigating` | Hourglass spinner, "fetching logs..." text                                                                                           |
| `brief_ready`   | Header with repo/workflow, fields (branch, commit, failed step), root cause section, confidence bar, suggested fix, 4 action buttons |
| `fixing`        | Wrench icon, "approved by @user", action description                                                                                 |
| `resolved`      | Green checkmark header, MTTR stat, fix applied                                                                                       |

**Action buttons (brief_ready state):**

- "Re-run with fix" (primary, green) → `action_id: approve_fix`
- "Dig deeper" → `action_id: dig_deeper`
- "Snooze 1h" → `action_id: snooze`
- "False alarm" (danger, red) → `action_id: false_alarm`

### 5. Slack Message Updates (`apps/server/src/slack/message.ts`)

**Changes:**

- `postInitialSlackMessage` → uses `buildBlocks({ status: 'investigating' })`
- `updateSlackWithBrief` → uses `buildBlocks({ status: 'brief_ready', brief, incident })`
- New: `updateSlackMessage(incidentId, state)` — generic update function
- New: `postThreadReply(incidentId, text)` — posts a reply in the incident's Slack thread

### 6. Interactions Handler (`apps/server/src/routes/interactions.ts`)

**Flow:**

1. Receive POST from Slack with form-encoded `payload`
2. Verify Slack signing secret
3. Acknowledge immediately (< 3 seconds)
4. Process action async:

| action_id     | Behavior                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------ |
| `approve_fix` | Update incident status to `fixing`, update Slack message, post thread reply                |
| `dig_deeper`  | Re-run agent with `broadenScope: true` flag (future: more tools), post thread reply        |
| `snooze`      | Update status to `snoozed`, schedule un-snooze (simple setTimeout for MVP), update message |
| `false_alarm` | Update status to `dismissed`, calculate MTTR, update message to resolved state             |

**Signature verification:** Slack sends `x-slack-signature` and `x-slack-request-timestamp` headers. Verify using HMAC-SHA256 with `config.delivery.slack.signing_secret`.

### 7. Webhook Route (`apps/server/src/routes/webhooks.ts`)

Minor change: ensure `workflowRunId` (already stored as `run.id`) is available to the agent context so it can be passed to the `get_workflow_logs` tool.

## Data Flow

```
GitHub webhook (workflow_run failure)
  → webhooks.ts: validate, create incident, post "investigating..." to Slack
  → runner.ts Phase A: generateText with get_workflow_logs tool
    → tool fetches logs via Octokit
    → onStepFinish logs tool call to DB
    → agent reasons about logs, may call tool again with different params
  → runner.ts Phase B: generateObject with conversation history → IncidentBrief
  → DB update: briefJson, rootCause, suggestedFix, confidence, status
  → Slack update: Block Kit message with brief + action buttons
  → Thread reply: tool call trace summary

User clicks button in Slack
  → interactions.ts: verify signature, acknowledge
  → Update incident status in DB
  → Update Slack message to new state
  → Post thread reply with action log
```

## File Changes

| File                                            | Action  | Description                                      |
| ----------------------------------------------- | ------- | ------------------------------------------------ |
| `apps/server/src/agent/runner.ts`               | Rewrite | Two-phase ReAct loop                             |
| `apps/server/src/agent/prompts.ts`              | Expand  | Full agent system prompt                         |
| `apps/server/src/agent/tools/github-actions.ts` | New     | get_workflow_logs tool                           |
| `apps/server/src/slack/blocks.ts`               | New     | Block Kit builder                                |
| `apps/server/src/slack/message.ts`              | Update  | Block Kit integration + thread replies           |
| `apps/server/src/routes/interactions.ts`        | Rewrite | Button click handlers                            |
| `apps/server/src/routes/webhooks.ts`            | Minor   | No changes needed (workflowRunId already stored) |

## Testing

- `agent.test.ts` — mock `generateText`/`generateObject`, verify two-phase flow and tool call logging
- `blocks.test.ts` — snapshot tests for each Block Kit message state
- `interactions.test.ts` — verify signature check, action routing, DB updates
- `github-actions-tool.test.ts` — mock Octokit, verify log fetching and truncation

## Dependencies

No new packages needed. Already have:

- `ai` (generateText, tool)
- `@octokit/rest` (GitHub API)
- `@slack/web-api` (Block Kit types)
- `zod` (tool parameter schemas)

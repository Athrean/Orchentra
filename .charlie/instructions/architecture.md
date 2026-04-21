# Orchentra Architecture

Key architectural constraints and patterns for the server and agent system.

## Scope

- `apps/server/**`
- `packages/cli-core/**`
- `packages/cli-api/**`
- `packages/cli-tools/**`

## Context

- Orchentra is an AI-native observability platform. The competitive set is Prometheus, Grafana, Datadog — not just CI triage tools.
- The server handles webhooks from GitHub, runs AI agent loops, and streams results via WebSocket.
- The CLI provides a local agent loop with multi-provider support (Anthropic, OpenAI, xAI, DashScope).

## Rules

### Webhook Pipeline

- [R1] Two-tier idempotency: in-memory Map for hot dedup plus DB unique index on `(provider, event_id)`.
- [R2] Store every webhook in an event table with status, retry_count, and error.
- [R3] Debounce rapid events by `(repo, branch, commit)` with a short window.

### Agent Loop

- [R4] Use both a turn-count cap and a cumulative token ceiling. Do not rely on step count alone.
- [R5] When history approaches context window, compact older messages into a structured summary.
- [R6] Split system prompt into static and dynamic sections. Mark the cache boundary for Anthropic prompt caching.
- [R7] Distinguish retryable errors (429, 5xx, timeout) from permanent errors (auth, schema). Only retry the former.
- [R8] Use exponential backoff: `initialMs * 2^(attempt-1)` capped at `maxMs`.

### Tool System

- [R9] Register tools with explicit permission levels (read / write / admin).
- [R10] Run a pre-hook before tool execution (safety gate) and a post-hook after (audit log, usage tracking).
- [R11] Always fetch workflow logs first, then let the LLM select follow-up tools.

### Streaming

- [R12] Use discriminated unions for WebSocket messages (`incident:created | agent:step | incident:status_changed | error`).
- [R13] Track per-client subscriptions and clean up on disconnect.
- [R14] Maintain a bounded replay buffer of recent agent steps per incident.

### Data Isolation

- [R15] Preserve org isolation on all reads/writes. Never use cross-org data.
- [R16] Never block webhook acknowledgements on long-running AI calls.

## References

1. CLAUDE.md -- AI Harness Design section
2. `apps/server/src/routes/webhooks.ts` -- webhook entry point
3. `apps/server/src/agent/runner.ts` -- agent loop

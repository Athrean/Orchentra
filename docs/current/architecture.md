# Architecture

This is the current module map after the CLI-only cut.

## Apps

| Path       | Role                                                                                 |
| ---------- | ------------------------------------------------------------------------------------ |
| `apps/cli` | Terminal app, Ink TUI, slash commands, auth flows, sessions, and command entrypoints |
| `apps/web` | Static Next.js marketing site for the CLI                                            |

`apps/web` must not grow auth, dashboards, GitHub App onboarding, DB access, reviewer flows, or imports from CLI internals. Product work belongs in the CLI unless a separate hosted service is explicitly approved.

## Packages

| Path                         | Role                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/cli-core`          | `ConversationRuntime`, provider abstractions, sessions/replay, permissions, hooks, compaction, budgets, memory |
| `packages/cli-tools`         | Built-in tools: bash, file, glob, grep, web, git, MCP client, task/todo/agent helpers                          |
| `packages/cli-api`           | Provider clients, GitHub clients, OAuth/device flows, credential stores                                        |
| `packages/brain`             | Episode/runbook/skill-export types and local-first memory substrate                                            |
| `packages/config-eslint`     | Shared ESLint config                                                                                           |
| `packages/config-typescript` | Shared TypeScript config                                                                                       |

## Runtime Flow

```text
TUI / headless CLI
  -> command registry or free-form turn
  -> ConversationRuntime
  -> provider client
  -> tool registry
  -> permission enforcer + hooks
  -> session JSONL + usage/cost accounting
```

## Spine Attachment Points

| Spine piece       | Where it attaches                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------- |
| output discipline | system prompt injection, command output policy, `/terse`                                  |
| context budget    | budget config, usage tracker, compaction, tool-output budgeting, future `/budget` command |
| lean code         | `/plan` architect prompt, `/build` builder prompt, future `/lean` command                 |

## Removed Era

These are not active architecture:

- `apps/server`
- `packages/operations`
- `packages/mcp-server`
- `packages/db`
- old `packages/core`
- Postgres/Supabase/Drizzle product backend
- DB-backed web reviewer
- execution graph as a hosted web product

Historical files live under `docs/archive/` only.

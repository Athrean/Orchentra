# AGENTS.md — Orchentra

Root `AGENTS.md` should be a short pointer to this file and [`canonical.md`](canonical.md). This file exists for agents that prefer an AGENTS-style summary.

## What We Build

Orchentra is a CLI-first coding crew.

It exists to:

- save output tokens with **output discipline**
- save input tokens and spend with **context budget**
- write less, better code with **lean code**
- make review trustworthy by running checks in **`/review`**

The web surface is a static marketing site only.

## Spine

Every built-in agent should be:

```text
output discipline + context budget + lean code + task focus
```

Specialists:

- `/plan` — architect
- `/build` / senior-dev — builder
- `/review` — verifier

## Current Packages

- `apps/cli` — TUI, slash commands, auth, sessions, tool surface
- `apps/web` — static marketing site
- `packages/cli-core` — runtime, sessions, permissions, hooks, compaction, budget, memory
- `packages/cli-tools` — file/bash/glob/grep/web/git tools and MCP client
- `packages/cli-api` — provider clients, GitHub clients, credential store/auth
- `packages/brain` — episode/runbook/skill-export types

## Removed Era

Do not reference these as live:

- `apps/server`
- `packages/operations`
- `packages/mcp-server`
- `packages/db`
- old `packages/core`
- Postgres/Supabase/Drizzle web product
- standalone web AI reviewer

## Work Rules

- New work gets a new branch.
- Conventional commits only.
- Never bypass pre-commit.
- Never commit secrets, env files, local agent caches, or vendored reference codebases.
- Non-trivial feature flow: plan -> issue slices -> TDD -> review -> lean pass.

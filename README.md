<div align="center">

<img src="apps/web/public/green-logo.png" alt="Orchentra" width="480">

### The DevOps engineer's daily co-pilot.

Open-source, terminal-native. CI failures, on-call alerts, and scheduled ops all flow through the same primitive — an **Execution Graph** of typed nodes you can query, replay, and explain.

[**What it is**](#what-it-is) · [**Status**](#status) · [**How it works**](#how-it-works) · [**Getting started**](#getting-started) · [**CLI**](#cli) · [**Self-hosting**](#self-hosting)

</div>

---

## What it is

Orchentra runs the work a DevOps engineer does between Slack pings:

- **Triages a CI failure** when a `workflow_run` webhook arrives — pulls logs, diffs the change, names a root cause, optionally opens a fix PR.
- **Investigates an alert** when Sentry fires — same loop, different entry point.
- **Runs scheduled ops** off a cron spec — health checks, queue drains, weekly sweeps.

Every run becomes an **execution** with a tree of **nodes** (tool calls, decisions, writebacks). The same graph powers the CLI (`orchentra graph <id>` / `orchentra why <node>`) and the web dashboard (read-only projection). One primitive, three surfaces.

This is **not** a Datadog/Grafana replacement, a "PR fixer" SaaS, or yet another alerting product. The wedge is the graph and the terminal.

## Status

| Phase | Description                                                        | Status                  |
| ----- | ------------------------------------------------------------------ | ----------------------- |
| 1     | `executions` + `nodes` schema (generalize from `incidents`)        | shipped                 |
| 2     | Execution kinds: Sentry `alert` + `cron`                           | shipped                 |
| 3     | `orchentra graph <executionId>` + `orchentra why <nodeId>`         | shipped (#228, #235)    |
| 4     | Web becomes read-only projection + cross-execution diff            | shipped (#225, #236–40) |
| 5     | Next adapter (deploy gating, runbook automation) — gated on demand | future                  |

Side-shipped: per-org LLM config (multi-provider), live agent investigation timeline, CLI Pro/Max OAuth on macOS (Keychain auto-detect), in-TUI login + model picker.

## How it works

```
Trigger arrives
  ├── GitHub workflow_run webhook   → execution.kind = 'ci_failure'
  ├── Sentry alert webhook           → execution.kind = 'alert'
  └── Cron tick                       → execution.kind = 'cron'
        │
        ▼
  Agent loop spawns nodes
   ├── tool_call:  fetch logs, read files, list commits, search code
   ├── tool_call:  pattern memory lookup
   ├── decision:   root-cause hypothesis + confidence
   └── writeback:  PR comment, check run, fix patch
        │
        ▼
  Same graph rendered in both surfaces
   ├── CLI:  orchentra graph <id>   →  ASCII tree
   ├── CLI:  orchentra why <nodeId> →  inputs + rationale
   └── Web:  /dashboard/exec/[id]   →  live timeline + node detail
```

Cross-execution diff (`/dashboard/diff`) lines up two executions for postmortems and A/B comparisons.

## Surfaces

**CLI (primary).** Interactive Ink TUI — REPL, slash commands (`/login`, `/doctor`, `/graph`, `/why`, `/issue`, `/pr`, `/model`, `/skills`, …), arrow-key model picker, in-TUI Anthropic OAuth login, native `--output-format json` for diagnostic verbs, resume model.

**Server.** Hono backend — webhooks (`workflow_run`, Sentry), cron tick, agent loop with multi-provider LLM (per-org config), Postgres-backed job queue with retry + dead-letter, idempotent two-tier dedup.

**Web (read-only).** Next.js dashboard — live agent timeline (WebSocket), execution graph view (kind-agnostic tree), node detail, cross-execution diff. No write paths.

## Investigation tools

The agent has typed tools for: workflow logs, commit + diff inspection, file reads, PR/issue listing, code search, pattern memory across past executions. Skills (`SKILL.md` files) ship reusable prompts as first-class slash commands.

## Tech stack

| Layer    | Technology                                                                     |
| -------- | ------------------------------------------------------------------------------ |
| Runtime  | [Bun](https://bun.sh) 1.3                                                      |
| Backend  | [Hono](https://hono.dev)                                                       |
| Frontend | [Next.js](https://nextjs.org) 15 (App Router)                                  |
| Database | PostgreSQL 17 + [Drizzle ORM](https://orm.drizzle.team)                        |
| AI       | [Vercel AI SDK](https://sdk.vercel.ai) — OpenRouter / Anthropic OAuth / OpenAI |
| GitHub   | [Octokit](https://octokit.github.io/rest.js)                                   |
| TUI      | [Ink](https://github.com/vadimdemedes/ink) + React                             |
| Styling  | [Tailwind CSS](https://tailwindcss.com) 4 + Framer Motion                      |
| Monorepo | Bun workspaces + [Turborepo](https://turbo.build)                              |

## Getting started

### Prerequisites

- [Bun](https://bun.sh) >= 1.3
- PostgreSQL >= 17 (or Docker)
- GitHub OAuth app credentials
- An LLM credential — OpenRouter key, Anthropic API key, or Claude Pro/Max subscription (CLI only, macOS auto-detect)

### Install

```bash
git clone https://github.com/Athrean/Orchentra.git
cd Orchentra
bun install
```

### Configure

```bash
cp orchentra.yml.example orchentra.yml
```

Edit with your credentials:

```yaml
github:
  webhook_secret: 'your-webhook-secret'
  token: 'ghp_xxx'
  oauth:
    client_id: 'your-github-client-id'
    client_secret: 'your-github-client-secret'
    redirect_uri: 'http://localhost:3001/auth/github/callback'
  repos:
    - 'my-org/api'
    - 'my-org/frontend'

llm:
  api_key: 'sk-or-xxx'
  model: 'anthropic/claude-sonnet-4-5'
```

### Database + run

```bash
bun run db:generate
bun run db:migrate
bun run dev
```

Server: `http://localhost:3001` · Web: `http://localhost:3000`.

## CLI

```bash
orchentra              # interactive TUI
orchentra doctor       # environment preflight (auth, DB, repo)
orchentra graph <id>   # ASCII tree of nodes for an execution
orchentra why <node>   # walk parent chain, print inputs + rationale
```

- **Anthropic auth:** [`docs/cli/anthropic-auth.md`](docs/cli/anthropic-auth.md) — Pro/Max subscription auto-detect on macOS, env precedence, opt-out, troubleshooting.
- **Skills:** [`docs/cli/skills.md`](docs/cli/skills.md) — frontmatter schema, discovery precedence, argument substitution, allowed-tools syntax, hot reload.
- **Examples:** [`examples/skills/`](examples/skills/) — drop-in `SKILL.md` samples (`/incident`, `/deploy`).

**macOS Pro/Max users:** if you already use Claude Code, just run `orchentra` — your subscription is picked up from the system Keychain on first request, no extra login needed.

Skills quick start: drop a `SKILL.md` at `<repo>/.orchentra/skills/<name>/SKILL.md`, restart the CLI (or `/skills reload`), invoke `/<name>`.

## Self-hosting

```bash
docker compose up -d
```

Starts PostgreSQL and the Orchentra server. Mount your `orchentra.yml` — compose handles the rest.

## Project structure

```
Orchentra/
├── apps/
│   ├── cli/                 # Ink TUI — REPL, slash commands, skills, OAuth flows
│   ├── server/              # Hono backend — webhooks, cron, agent, queue, integrations
│   └── web/                 # Next.js — dashboard, exec graph view, cross-exec diff
├── packages/
│   ├── cli-core/            # Skill loader, permissions, runtime primitives
│   ├── cli-api/             # Provider clients (Anthropic OAuth, GitHub, Gemini), keychain
│   ├── cli-tools/           # Built-in tool registry + MCP transport
│   ├── core/                # Shared schemas, types (executions/nodes), utilities
│   ├── db/                  # Drizzle schema, migrations, client
│   ├── config-eslint/       # Shared ESLint config
│   └── config-typescript/   # Shared TypeScript config
├── docs/cli/                # CLI guides (Anthropic auth, skills authoring)
├── examples/skills/         # Sample SKILL.md files
├── docker-compose.yml
├── orchentra.yml.example
└── CLAUDE.md                # Vision, roadmap, principles (canonical)
```

## Development

```bash
bun run dev          # All apps in dev mode
bun run build        # Production build
bun run typecheck    # Type checking across all packages
bun run lint         # Lint all packages
bun run test         # Server tests
bun run test:precommit  # CLI stack tests (cli-core, cli-api, cli-tools, cli)
bun run format       # Prettier
```

---

<div align="center">

Built by [Athrean](https://github.com/Athrean) · Vision + roadmap in [`CLAUDE.md`](CLAUDE.md)

</div>

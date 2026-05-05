<div align="center">

<img src="apps/web/public/green-logo.png" alt="Orchentra" width="480">

### Contract-first DevOps operations runtime.

Open-source, terminal-native. Every capability is a typed `Operation` exposed over two surfaces from one registry: a CLI for humans and an MCP server for external agents (Claude Desktop, Cursor, Windsurf). Trust-boundary enforcement lives in the runtime, not the caller.

[**What is Orchentra**](#what-is-orchentra) · [**Quick start**](#quick-start) · [**Status**](#status) · [**How it works**](#how-it-works) · [**Getting started**](#getting-started) · [**CLI**](#cli) · [**Self-hosting**](#self-hosting)

</div>

---

## What is Orchentra

Orchentra is a contract-first DevOps operations runtime. Every capability — fetching workflow logs, posting a PR comment, searching code — is a typed `Operation` (Zod-validated input/output, declared trust class, single handler) registered once and exposed over two surfaces: the `orchentra` CLI for humans, and an MCP server for external agents like Claude Desktop, Cursor, and Windsurf. Both call into the same registry, so the same operations show up wherever the engineer already works. Webhooks (CI failures, Sentry alerts, cron ticks) record every run as an **execution** with a tree of **nodes**, and the web dashboard is a read-only projection of that graph.

This is **not** a Datadog/Grafana replacement, a "PR fixer" SaaS, or yet another alerting product. The wedge is the operations contract, the graph, and the terminal.

## Quick start

```bash
git clone https://github.com/Athrean/Orchentra.git
cd Orchentra
bun install
orchentra mcp serve   # stdio MCP server, ready to wire into an MCP client
```

To wire the stdio server into an MCP client, add an entry to its `mcpServers` config that runs `orchentra mcp serve`. See your client's docs for the exact config-file location:

- Claude Desktop — `claude_desktop_config.json` <!-- TODO: link once docs page lands -->
- Cursor — `~/.cursor/mcp.json` <!-- TODO: link once docs page lands -->
- Windsurf — MCP settings panel <!-- TODO: link once docs page lands -->

Phase 1B will add an HTTP transport behind bearer auth so the same operations are reachable from a hosted endpoint.

## Status

| Phase | Description                                                        | Status                  |
| ----- | ------------------------------------------------------------------ | ----------------------- |
| 1     | `executions` + `nodes` schema (generalize from `incidents`)        | shipped                 |
| 1A    | Operations contract + stdio MCP server (`orchentra mcp serve`)     | shipped (#295)          |
| 1B    | HTTP MCP transport + bearer auth + hosted Worker scaffold          | next                    |
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

**MCP server.** `orchentra mcp serve` exposes the operations registry to external MCP clients (Claude Desktop, Cursor, Windsurf) over stdio. Same operations the CLI verbs hit, validated by the same Zod schemas, with trust-class enforcement at dispatch. HTTP transport + bearer auth lands in Phase 1B.

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
orchentra                                       # interactive TUI
orchentra doctor                                # environment preflight (auth, DB, repo)
orchentra mcp serve                             # stdio MCP server exposing the operations registry
orchentra graph <executionId>                   # ASCII tree of nodes for an execution
orchentra graph <executionId> --output-format json
orchentra why <nodeId>                          # walk parent chain, print inputs + rationale
orchentra why <nodeId> --output-format json
```

- **Anthropic auth:** Pro/Max subscription auto-detect on macOS, env precedence, opt-out, troubleshooting. <!-- TODO: link once docs/cli/anthropic-auth.md lands -->
- **Skills:** frontmatter schema, discovery precedence, argument substitution, allowed-tools syntax, hot reload. <!-- TODO: link once docs/cli/skills.md lands -->
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
│   ├── operations/          # @orchentra/operations — typed Operation contract + registry
│   ├── mcp-server/          # @orchentra/mcp-server — stdio MCP transport over the registry
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

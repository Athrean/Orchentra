<div align="center">

<img src="apps/web/public/green-logo.png" alt="Orchentra" width="480">

### Stop configuring dashboards. Start shipping.

You're a startup. You don't have an SRE team. You sure as hell don't have time to configure Prometheus alerts, build Grafana dashboards, and wire up PagerDuty — just to find out your CI broke because someone forgot a semicolon.

**Orchentra is AI-native observability.** No dashboards. No alert rules. When something breaks, an AI agent investigates, explains what happened, and opens a fix PR. You review and approve. That's it.

[**Getting Started**](#getting-started) · [**How It Works**](#how-it-works) · [**What It Replaces**](#what-it-replaces) · [**Features**](#features) · [**Self-Hosting**](#self-hosting)

</div>

---

## The Problem

Your CI breaks at 2 AM. Here's what "industry standard" observability looks like:

```
Prometheus  →  "CPU above 80%"       (cool, which service? why?)
Grafana     →  stare at graphs       (is that spike normal?)
PagerDuty   →  WAKE UP               (you're already awake now)
You         →  ssh in, read logs     (for 45 minutes)
```

Three tools, zero answers, one tired engineer. Startups don't have time for this.

**Orchentra does what a senior on-call engineer would do** — read the logs, check the diff, find the root cause, write the fix — except it takes 60 seconds instead of 45 minutes.

## How It Works

```
Something breaks
       │
       ▼
  Orchentra catches it          (webhook, alert, whatever you plug in)
       │
       ▼
  AI agent investigates
   ├── Pulls the failed job logs
   ├── Checks what changed (commits, configs, deps)
   ├── Reads the relevant source files
   ├── Correlates with past incidents & known patterns
   ├── Searches the codebase for related issues
   │
   ▼
  You get a brief — not an alert
   ├── What broke (with evidence)
   ├── Why it broke (root cause, confidence score)
   ├── How to fix it (suggested patch)
   │
   ▼
  One-click fix PR              (for high-confidence failures)
       │
       ▼
  Auto-resolves when CI passes  (you didn't even have to think)
```

## What It Replaces

| Instead of this                         | Orchentra does this                                  |
| --------------------------------------- | ---------------------------------------------------- |
| Prometheus alert rules you never get to | AI detects failures from webhooks automatically      |
| Grafana dashboards nobody reads         | Root-cause briefs that tell you _what broke and why_ |
| PagerDuty pages at 3 AM                 | A root-cause brief delivered with the failure        |
| Manual log diving for 45 minutes        | Agent investigates in 60 seconds                     |
| Copy-pasting stack traces into Google   | Pattern memory from past incidents across your org   |
| Writing a fix PR yourself               | Auto-generated patch PRs you just review and approve |

## Features

**Investigation**

- 6 AI investigation tools — workflow logs, commit diffs, file contents, PR/issues, code search, pattern memory
- Pattern learning — remembers resolved incidents and applies past solutions to similar failures
- Structured briefs — failure type, root cause, confidence score, suggested fix

**Remediation**

- Code patch generation — creates real fix PRs with file diffs, not metadata-only commits
- Auto-resolve loop — watches CI after a fix PR and closes the incident when tests pass
- GitHub-native output — check runs, commit statuses, and PR comments

**Platform**

- Real-time dashboard — WebSocket-powered incident view with live agent steps
- Multi-tenant — org-scoped access, role-based permissions, per-org configuration
- MTTR tracking — measures mean time to resolution per org
- Token cost estimation — per-incident LLM spend tracking
- Idempotent webhooks — two-tier dedup (in-memory + DB unique index) with replay support
- Async job queue — Postgres-backed with retry, exponential backoff, and dead-letter handling

## Tech Stack

| Layer    | Technology                                                                   |
| -------- | ---------------------------------------------------------------------------- |
| Runtime  | [Bun](https://bun.sh) 1.3                                                    |
| Backend  | [Hono](https://hono.dev)                                                     |
| Frontend | [Next.js](https://nextjs.org) 15 (App Router)                                |
| Database | PostgreSQL 17 + [Drizzle ORM](https://orm.drizzle.team)                      |
| AI       | [Vercel AI SDK](https://sdk.vercel.ai) + [OpenRouter](https://openrouter.ai) |
| GitHub   | [Octokit](https://octokit.github.io/rest.js)                                 |
| Styling  | [Tailwind CSS](https://tailwindcss.com) 4 + Framer Motion                    |
| Monorepo | Bun workspaces + [Turborepo](https://turbo.build)                            |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.3
- PostgreSQL >= 17 (or Docker)
- GitHub OAuth app credentials
- OpenRouter API key (or any OpenAI-compatible endpoint)

### 1. Clone & Install

```bash
git clone https://github.com/Athrean/Orchentra.git
cd Orchentra
bun install
```

### 2. Configure

```bash
cp orchentra.yml.example orchentra.yml
```

Edit `orchentra.yml` with your credentials:

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

### 3. Set up the Database

```bash
bun run db:generate
bun run db:migrate
```

### 4. Run

```bash
bun run dev
```

The server starts at `http://localhost:3001` and the web app at `http://localhost:3000`.

## Self-Hosting with Docker

```bash
docker compose up -d
```

This starts PostgreSQL and the Orchentra server. Mount your `orchentra.yml` — the compose file handles the rest.

## Project Structure

```
Orchentra/
├── apps/
│   ├── cli/                 # Interactive Ink TUI — REPL, slash commands, skills
│   ├── server/              # Hono backend — webhooks, agent, queue, GitHub integrations
│   └── web/                 # Next.js frontend — dashboard, landing, onboarding
├── packages/
│   ├── cli-core/            # Skill loader, permissions, runtime primitives
│   ├── cli-api/             # Tool argument parsing + API helpers
│   ├── cli-tools/           # Built-in tool registry
│   ├── core/                # Shared types, schemas, utilities
│   ├── db/                  # Drizzle schema, migrations, client
│   ├── config-eslint/       # Shared ESLint config
│   └── config-typescript/   # Shared TypeScript config
├── docs/
│   └── cli/                 # CLI guides (skills authoring, etc.)
├── examples/
│   └── skills/              # Sample SKILL.md files (incident, deploy)
├── docker-compose.yml
├── orchentra.yml.example    # Configuration template
└── CLAUDE.md                # AI agent instructions
```

## Incident Lifecycle

```
investigating → brief_ready → fixing → resolved
                  │
                  └── error (retryable via dead-letter queue)
```

Each incident tracks: failure context, agent tool calls, structured brief, confidence score, token usage, MTTR, and all actions taken.

## CLI

The interactive CLI ships in `apps/cli/`. It's an Ink-based REPL with slash commands, hook integrations, and a **skills system** for shipping reusable prompts.

- **Author guide:** [`docs/cli/skills.md`](docs/cli/skills.md) — frontmatter schema, discovery precedence, argument substitution, allowed-tools syntax, hot reload, troubleshooting.
- **Examples:** [`examples/skills/`](examples/skills/) — drop-in `SKILL.md` samples for `/incident` and `/deploy`.

Quick start: drop a `SKILL.md` at `<repo>/.orchentra/skills/<name>/SKILL.md`, restart the CLI (or `/skills reload`), and invoke `/<name>`.

## Development

```bash
bun run dev          # Start all apps in dev mode
bun run build        # Production build
bun run typecheck    # Type checking across all packages
bun run lint         # Lint all packages
bun run test         # Run server tests
bun run format       # Format with Prettier
```

---

<div align="center">

Built by [Athrean](https://github.com/Athrean)

</div>

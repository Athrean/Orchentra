<div align="center">

<img src="apps/web/public/green-logo.png" alt="Orchentra" width="480">

### Your CI/CD pipeline, operated by AI.

When a GitHub Actions workflow fails, Orchentra investigates the failure, writes a root-cause brief, posts it to GitHub & Slack, and opens a fix PR — all before you finish reading the alert.

[**Getting Started**](#-getting-started) · [**How It Works**](#-how-it-works) · [**Features**](#-features) · [**Self-Hosting**](#-self-hosting) · [**Tech Stack**](#-tech-stack)

</div>

---

## The Problem

CI failures waste hours of engineering time on triage: reading logs, checking diffs, correlating commits, guessing root causes. Most failures are repetitive — the same patterns, the same fixes.

**Orchentra automates the entire triage loop.** An AI agent investigates every failure with the same tools a human would use, learns from past resolutions, and can propose real code fixes.

## How It Works

```
GitHub Actions fails
        │
        ▼
  Webhook received  ──►  Signature verified  ──►  Incident created
        │
        ▼
  AI Agent investigates
   ├── Fetch failed job logs
   ├── Inspect commit changes
   ├── Read relevant file contents
   ├── Check related PRs & issues
   ├── Search code for patterns
   │
   ▼
  Structured brief synthesized
   ├── Failure type & confidence score
   ├── Root cause summary
   ├── Suggested fix
   │
   ▼
  Triage written back
   ├── GitHub check run / status
   ├── PR comment with full brief
   ├── Slack notification
   │
   ▼
  Fix PR created (high-confidence)
        │
        ▼
  Auto-resolve loop watches CI pass
```

## Features

- **End-to-end incident triage** — from webhook to root-cause brief in under 60 seconds
- **6 investigation tools** — workflow logs, commit diffs, file contents, PR/issues, code search, pattern memory
- **Pattern learning** — remembers resolved incidents and applies past solutions to similar failures
- **Code patch generation** — creates real fix PRs with file diffs (not metadata-only commits)
- **Auto-resolve loop** — watches CI after a fix PR and closes the incident when tests pass
- **GitHub-native output** — check runs, commit statuses, and PR comments
- **Slack integration** — briefs, thread replies, and state updates via Block Kit
- **Real-time dashboard** — WebSocket-powered incident view with live agent steps
- **Multi-tenant** — org-scoped access, role-based permissions, per-org configuration
- **MTTR tracking** — measures mean time to resolution per org
- **Token cost estimation** — per-incident LLM spend tracking
- **Idempotent webhooks** — two-tier dedup (in-memory + DB unique index) with replay support
- **Async job queue** — Postgres-backed with retry, exponential backoff, and dead-letter handling

## Tech Stack

| Layer    | Technology                                                                   |
| -------- | ---------------------------------------------------------------------------- |
| Runtime  | [Bun](https://bun.sh) 1.3                                                    |
| Backend  | [Hono](https://hono.dev)                                                     |
| Frontend | [Next.js](https://nextjs.org) 15 (App Router)                                |
| Database | PostgreSQL 17 + [Drizzle ORM](https://orm.drizzle.team)                      |
| LLM      | [Vercel AI SDK](https://sdk.vercel.ai) + [OpenRouter](https://openrouter.ai) |
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

delivery:
  slack:
    bot_token: 'xoxb-xxx'
    signing_secret: 'xxx'
    channel: '#incidents'
  github_comments: true
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
│   ├── server/              # Hono backend — webhooks, agent, queue, GitHub/Slack
│   └── web/                 # Next.js frontend — dashboard, landing, onboarding
├── packages/
│   ├── core/                # Shared types, schemas, utilities
│   ├── db/                  # Drizzle schema, migrations, client
│   ├── config-eslint/       # Shared ESLint config
│   └── config-typescript/   # Shared TypeScript config
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

## Development

```bash
bun run dev          # Start all apps in dev mode
bun run build        # Production build
bun run typecheck    # Type checking across all packages
bun run lint         # Lint all packages
bun run test         # Run server tests
bun run format       # Format with Prettier
```

## License

This project is private and proprietary. See the repository for license details.

---

<div align="center">

Built by [Athrean](https://github.com/Athrean)

</div>

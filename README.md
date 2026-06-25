<div align="center">

<img src="apps/web/public/stripped-black.png" alt="Orchentra" width="120">

# Orchentra

### The coding crew that spends less and writes less.

Orchentra is a CLI-first AI coding agent that spends fewer tokens and writes less, higher-quality code — paired with an AI code reviewer that verifies pull requests by running them.

[**Why**](#why-orchentra) · [**Quick start**](#quick-start) · [**What ships today**](#what-ships-today) · [**CLI**](#cli) · [**The crew + the reviewer**](#the-crew--the-reviewer) · [**Status**](#status)

</div>

---

## Why Orchentra

Coding agents have crossed the capability bar. The next axis of competition is **economics and trust** — teams running agents at scale feel the token bill and the code bloat in equal measure, and "looks good to me" reviews from an AI nobody verifies don't earn trust.

Orchentra attacks both:

> **Spend less** — terse output saves output tokens; a context budget + compaction and a hard dollar cap save input tokens and prevent runaway spend. **Write less** — a lean-code discipline (reach for the stdlib, the platform, an existing dependency, one line — before new code). **Trust the review** — the reviewer proposes findings _and verifies them by running_ your tests; it does not just assert.

Not a capability race and not an observability stack. The bet is **efficiency and verifiable review**, not feature count.

## Quick start

```bash
git clone https://github.com/Athrean/Orchentra.git
cd Orchentra
bun install

bun run --cwd apps/cli start
```

Useful commands:

```bash
orchentra                         # interactive TUI
orchentra "<prompt>"              # one-shot prompt
orchentra doctor                  # environment preflight
orchentra init                    # scaffold local .orchentra config
orchentra resume latest           # resume the latest workspace session
```

Bring your own model key. The CLI supports Anthropic, OpenAI-compatible providers, OpenRouter, Gemini, xAI, and DashScope through the provider layer.

## What ships today

- **Terminal-native agent CLI** — streaming Ink TUI, collapsible reasoning, command palette, model picker, theme picker, multi-line input modal, and `$EDITOR` handoff.
- **General-purpose tools** — bash, file read/write/edit, glob, grep, web fetch/search, notebooks, todos, tasks, ask-user, and agent/task helpers.
- **MCP client** — connect external MCP servers and register their tools into the CLI runtime.
- **Session persistence** — per-workspace JSONL sessions with resume and replay.
- **Permission system** — mode ladder, pattern rules, remembered approvals, workspace scoping checks, and hook-based pre/post tool gates.
- **Provider effort control** — `/effort` and `/think` map low/medium/high reasoning effort into provider request options.
- **Engineering-memory substrate** — `packages/brain` has episodes, patterns, runbooks, embedding-based similarity, and pattern context plumbing.
- **Web product surface** — standalone Next.js/Supabase app for onboarding, repo insight surfaces, memory, detections, and settings.

## CLI

### Shell verbs

```bash
orchentra
orchentra "<prompt>"
orchentra doctor
orchentra init
orchentra mcp list
orchentra mcp test <server>
orchentra session replay <id>
orchentra login | logout | reauth | auth-status
```

### REPL slash commands

Core:

```text
/help (/h /?)   /status (/st)   /clear (/cls)   /exit (/q)
/compact        /model (/m)     /effort         /think
/plan           /cost           /version (/v)   /restart
```

Workspace:

```text
/init           /search         /scan           /review
/diff (/d)      /commit         /pr             /issue (/iss)
/session        /resume         /skills
```

Tools and auth:

```text
/mcp            /permissions    /doctor (/doc)  /config (/cfg)
/export         /login (/li)    /logout (/lo)   /reauth
/auth-status (/whoami)
```

## Skills and hooks

Skills are local `SKILL.md` files:

```text
.orchentra/skills/<name>/SKILL.md
```

Restart the CLI, or run `/skills reload`, then invoke the skill as `/<name>`.

Hooks are repo-local shell gates:

```json
{
  "version": 1,
  "hooks": [
    { "event": "pre_tool_use", "tools": ["Bash"], "command": "./scripts/audit-bash.sh" },
    { "event": "post_tool_use", "tools": ["*"], "command": "./scripts/log-tool.sh" }
  ]
}
```

A pre-hook non-zero exit blocks the tool call and surfaces stderr as the reason. Hooks reload on CLI restart.

## The crew + the reviewer

Every built-in agent shares one spine: **spend less** (terse output, a context budget + compaction, and a hard dollar cap) and **write less** (a lean-code discipline — reach for the stdlib, the platform, and existing dependencies before writing new code). Specialist agents add focus on top:

- **plan** — turns a need into the best stack with named alternatives and scaffolds the project.
- **build** — implements test-first, delegating parallel slices to subagents under the budget cap.
- **review** — proposes findings and **verifies them by running** tests, types, and repros.

The **web** is the AI code reviewer: it reviews and tests pull requests with full-codebase context — a standalone product connected only through the shared store, never importing the CLI.

These land in phases; today the CLI ships the agent loop, the efficiency controls, and the verification primitives in the table below.

## Status

| Area                                                    | Status  |
| ------------------------------------------------------- | ------- |
| CLI/TUI runtime, streaming, command palette             | shipped |
| General tools (bash/file/glob/grep/web + read-only git) | shipped |
| MCP client                                              | shipped |
| Sessions, resume, replay                                | shipped |
| Permissions, hooks, `/permissions`                      | shipped |
| Dollar budget (warn + hard cap), `/cost`                | shipped |
| `/effort` `/think` `/plan` `/review` `/search`          | shipped |
| `/memory` `/forget`, failure signatures, auto-capture   | shipped |
| Terse-output mode + savings badge                       | next    |
| Planner + builder agents on the shared spine            | next    |
| Verify-by-running review + speculative context          | next    |
| Web AI code reviewer (review + test PRs)                | next    |

## Project structure

```text
Orchentra/
├── apps/
│   ├── cli/                 # TUI, slash commands, auth, sessions
│   └── web/                 # standalone Next.js/Supabase product surface
├── packages/
│   ├── brain/               # episodes, patterns, runbooks, memory matching
│   ├── cli-api/             # provider clients, GitHub clients, auth helpers
│   ├── cli-core/            # conversation runtime, sessions, permissions, skills
│   ├── cli-tools/           # built-in tools + MCP client
│   ├── config-eslint/
│   └── config-typescript/
└── README.md
```

## Development

```bash
bun install
bun run typecheck
bun run lint
bun run test:precommit
```

---

<div align="center">

Built by [Athrean](https://github.com/Athrean). Spend less, write less, verify the review.

</div>

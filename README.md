<div align="center">

<img src="apps/web/public/stripped-black.png" alt="Orchentra" width="120">

# Orchentra

### The engineering memory layer for repeated CI, deploy, and production failures.

Orchentra watches the debugging trail, remembers how your team fixed failures before, and gives agents the context to explain and safely fix the same class of issue next time.

[**Why**](#why-orchentra) · [**Quick start**](#quick-start) · [**What ships today**](#what-ships-today) · [**CLI**](#cli) · [**Memory loop**](#memory-loop) · [**Status**](#status)

</div>

---

## Why Orchentra

Engineering teams do not need more dashboards. They need memory.

Every failed deploy, broken workflow, flaky test, rollback, and fix PR creates useful operational knowledge. Most teams throw that knowledge away after the incident is resolved. Orchentra captures the trail, extracts reusable patterns, and turns those patterns into context and executable actions for agents.

The wedge is narrow on purpose:

> A GitHub Actions deploy fails. Orchentra inspects the logs, finds similar historical failures, explains the likely cause, and proposes or opens the fix PR.

This is not a Datadog replacement, generic incident-management suite, or generic coding assistant. The product is the company brain for engineering operations.

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

## Memory loop

The Phase 5 loop is the product wedge:

```text
CI/deploy failure
  → normalize failure signature
  → retrieve similar episodes/patterns/runbooks
  → explain likely cause
  → propose or open a fix PR
  → record whether the fix was useful
  → strengthen future retrieval
```

Current state:

- failure ingestion and execution graph concepts are established;
- `packages/brain` contains the local memory primitives;
- CLI sessions and tool trails are replayable;
- the missing Phase 5 work is first-class failure records, automatic memory extraction, retrieval feedback, and `/debug`.

## Status

| Area                                               | Status  |
| -------------------------------------------------- | ------- |
| CLI/TUI runtime                                    | shipped |
| General-purpose tools                              | shipped |
| MCP client                                         | shipped |
| Sessions, resume, replay                           | shipped |
| Permissions, hooks, `/permissions` UX              | shipped |
| `/effort`, `/think`, `/plan`, `/search`, `/review` | shipped |
| Web onboarding/settings/memory surfaces            | partial |
| Incident memory records + failure signatures       | next    |
| Auto-extract memory after turns                    | next    |
| `/debug latest failed deploy` loop                 | next    |
| Auto-compact and budget hard stops                 | next    |

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

Built by [Athrean](https://github.com/Athrean). Depth before breadth: memory for repeated engineering failures.

</div>

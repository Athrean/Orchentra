<div align="center">

<img src="apps/web/public/black-logo.png" alt="Orchentra" width="120">

# Orchentra

### A CLI-first coding crew that spends less, writes less, and proves its review by running the code.

[Quick start](#quick-start) · [Spine](#spine) · [CLI](#cli) · [Develop](#develop)

</div>

---

## What Is Orchentra?

Orchentra is an AI coding agent that runs in your terminal. It can read and edit files, run shell commands, search the workspace, inspect git state, fetch web pages, use MCP tools, and continue from saved sessions.

The product is CLI-only and zero-DB. The web app in `apps/web` is a static marketing site for the CLI; it has no auth, database, GitHub App flow, dashboard, subscription management, or standalone pull-request reviewer.

## Spine

Every built-in agent should inherit the same spine:

| Spine skill           | Job                                                                 | Saves                |
| --------------------- | ------------------------------------------------------------------- | -------------------- |
| **output discipline** | terse output that keeps code, paths, errors, and safety text intact | output tokens        |
| **context budget**    | compaction, tool-output caps, and dollar ceilings                   | input tokens + spend |
| **lean code**         | YAGNI, stdlib-first, minimum-code implementation discipline         | code size + quality  |

Specialist commands layer task focus on top of that spine:

- `/plan` — architect a need into stack, alternatives, architecture, scaffold, and checks.
- `/build` — implement vertical slices and run project checks.
- `/review` — propose findings, then verify by running typecheck/tests/repro gates.

## Quick Start

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
orchentra session replay latest   # replay the latest workspace session
```

Bring your own model key. The CLI supports Anthropic, Gemini, OpenAI-compatible providers, OpenRouter, xAI, and DashScope.

## CLI

### Shell Verbs

```bash
orchentra
orchentra "<prompt>"
orchentra doctor
orchentra init
orchentra update
orchentra mcp list
orchentra mcp test <server>
orchentra session replay <id|latest>
orchentra login | logout | reauth | whoami
```

### Slash Commands

```text
/help (/h /?)   /status (/st)   /clear (/cls)   /exit (/q)
/compact        /model (/m)     /effort         /think
/terse          /plan           /build          /review
/cost           /version (/v)   /init           /search
/scan           /debug          /diff (/d)      /commit
/pr             /issue (/iss)   /session        /resume
/skills         /mcp            /permissions    /doctor (/doc)
/config (/cfg) /memory (/mem)  /forget         /export
/login (/li)   /logout (/lo)   /reauth         /auth (/whoami)
```

Planned naming cleanup: keep existing names for compatibility, strengthen `/terse`, and add `/budget` plus `/lean` once those controls are first-class.

## Configuration

Project settings can live in:

```text
.orchentra/settings.json
.orchentra/settings.local.json
```

Example:

```json
{
  "model": "claude-sonnet-4-20250514",
  "effort": "medium",
  "terseMode": "lite",
  "budget": {
    "warnCostUsd": 1,
    "maxCostUsd": 5
  }
}
```

## Skills And Hooks

Skills are local `SKILL.md` files:

```text
.orchentra/skills/<name>/SKILL.md
```

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

A failing pre-hook blocks the tool call and surfaces stderr as the reason.

## Project Structure

```text
Orchentra/
├── apps/
│   ├── cli/                 # terminal app, TUI, commands, auth
│   └── web/                 # static marketing site
├── docs/                    # current docs + proposals
├── packages/
│   ├── brain/               # episode/runbook/skill-export types
│   ├── cli-api/             # provider clients, GitHub clients, auth helpers
│   ├── cli-core/            # runtime, sessions, permissions, memory, budget
│   ├── cli-tools/           # built-in tools + MCP client
│   ├── config-eslint/
│   └── config-typescript/
└── README.md
```

## Develop

```bash
bun install
bun run typecheck
bun run lint
bun run test:precommit
bun run build
```

---

<div align="center">

Built by [Athrean](https://github.com/Athrean).

</div>

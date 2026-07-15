<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/white-logo.svg">
  <img src="apps/web/public/black-logo.svg" alt="Orchentra" width="120">
</picture>

# Orchentra

### The local-first coding harness from Athrean Lab, being built to prove completion by running the code and the product.

[Quick start](#quick-start) · [Harness foundations](#harness-foundations) · [CLI](#cli) · [Develop](#develop)

</div>

---

## What Is Orchentra?

Orchentra is Athrean Lab's local-first AI coding harness. It runs in your terminal and today can read and edit files, run shell commands, search the workspace, inspect git state, fetch web pages, use MCP tools, and continue from saved sessions.

M1 is complete: one truthful orchestrator now covers normal turns, one-shot, composites, and sub-agents; runs carry typed evidence, honest accounting, durable compaction notes, and reconstructable local traces. The next phase adds browser-native execution and verification. The target is simple: Orchentra should not claim a task is done based only on model prose or an exit code.

The product is CLI-only and zero-DB. The web app in `apps/web` is a static marketing site for the CLI; it has no auth, database, GitHub App flow, dashboard, subscription management, or standalone pull-request reviewer.

## Harness Foundations

Every built-in agent inherits the same efficiency spine. It remains implementation discipline while evidence-gated verification becomes the product's headline capability:

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
/terse          /budget         /lean           /plan
/build          /review         /statusline     /usage
/cost           /version (/v)   /init           /search
/scan           /debug          /diff (/d)      /commit
/pr             /issue (/iss)   /session        /resume
/skills         /mcp            /permissions    /doctor (/doc)
/config (/cfg) /memory (/mem)  /forget         /export
/login (/li)   /logout (/lo)   /reauth         /auth (/whoami)
```

## Configuration

Project settings can live in:

```text
.orchentra/settings.json
.orchentra/settings.local.json
```

Example:

```json
{
  "model": "claude-sonnet-4-6",
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
├── packages/
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

Orchentra is built by [Athrean Lab](https://github.com/Athrean).

</div>

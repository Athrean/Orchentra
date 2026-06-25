<div align="center">

<img src="apps/web/public/stripped-black.png" alt="Orchentra" width="120">

# Orchentra

### Efficient AI coding in the terminal, plus review that verifies by running.

[Quick start](#quick-start) · [Key features](#key-features) · [CLI](#cli) · [Web reviewer](#web-reviewer) · [Develop](#develop)

</div>

---

## What is Orchentra?

Orchentra is an AI coding agent that runs in your terminal. It can read and edit files, run shell commands, search the workspace, inspect git state, fetch web pages, use MCP tools, and continue from saved sessions.

The product is tuned for two things:

- **Lower spend** — terse output mode, compaction, token tracking, and hard dollar budgets.
- **Higher trust** — code review flows that check their findings by running tests, typechecks, or repro commands where possible.

Orchentra also includes a standalone web reviewer for pull requests.

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
orchentra session replay latest   # replay the latest workspace session
```

Bring your own model key. The CLI supports Anthropic, Gemini, OpenAI-compatible providers, OpenRouter, xAI, and DashScope.

## Key features

- **Terminal-native agent UI** — streaming Ink TUI, collapsible reasoning, command palette, model picker, theme picker, multi-line input, and `$EDITOR` handoff.
- **Workspace tools** — bash, file read/write/edit, glob, grep, web fetch/search, notebooks, todos, tasks, ask-user, nested agent runs, and read-only git tools.
- **MCP client** — connect external MCP servers and register their tools into the agent runtime.
- **Sessions** — per-workspace JSONL sessions with resume and replay.
- **Permissions** — mode ladder, allow/deny/ask rules, remembered approvals, workspace scoping checks, and pre/post tool hooks.
- **Model controls** — `/model`, `/effort`, `/think`, and provider-specific reasoning settings.
- **Cost controls** — `/cost`, token accounting, warning thresholds, and hard dollar caps.
- **Memory** — local failure-memory capture, `/memory`, `/forget`, and `/debug` for diagnosing recent failed runs against stored context.
- **Terse output mode** — `/terse off|lite|full|ultra` reduces output verbosity while keeping code, commands, paths, errors, and safety text intact.

## CLI

### Shell verbs

```bash
orchentra
orchentra "<prompt>"
orchentra doctor
orchentra init
orchentra mcp list
orchentra mcp test <server>
orchentra session replay <id|latest>
orchentra login | logout | reauth | whoami
```

### REPL slash commands

Core:

```text
/help (/h /?)   /status (/st)   /clear (/cls)   /exit (/q)
/compact        /model (/m)     /effort         /think
/terse          /plan           /cost           /version (/v)
```

Workspace:

```text
/init           /search         /scan           /review
/debug          /diff (/d)      /commit         /pr
/issue (/iss)   /session        /resume         /skills
```

Tools and auth:

```text
/mcp            /permissions    /doctor (/doc)  /config (/cfg)
/memory         /forget         /export         /login (/li)
/logout (/lo)   /reauth         /auth-status (/whoami)
```

## Web reviewer

The web app is a standalone pull-request reviewer. It has its own auth, onboarding, settings, memory surfaces, and reviewer flows. It does not import the CLI app; shared data moves through the configured store.

Run it locally:

```bash
bun run --cwd apps/web dev
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
  "model": "claude-sonnet-4-20250514",
  "effort": "medium",
  "terseMode": "lite",
  "budget": {
    "warnCostUsd": 1,
    "maxCostUsd": 5
  }
}
```

## Skills and hooks

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

## Project structure

```text
Orchentra/
├── apps/
│   ├── cli/                 # terminal app, TUI, commands, auth
│   └── web/                 # standalone web reviewer
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

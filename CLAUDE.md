# CLAUDE.md — Orchentra core

This is the only doc that defines **what we're building** and **how to build it**. Read it before starting any new feature. Update it intentionally when the plan changes — do not let it rot.

Last refresh: 2026-05-05.

---

## 1. Vision

**Orchentra is a contract-first DevOps operations runtime.** Every capability we ship is an `Operation` — a typed, schema-validated unit of work — exposed over two surfaces from the same registry: a CLI for humans, and an MCP server for external agents (Claude Desktop, Cursor, Windsurf). The execution graph (`executions` + `nodes`) records every invocation regardless of which surface called it. Trust-boundary enforcement (org/repo scoping, approval gates) lives in the runtime, not in any individual caller.

We are **not** a "PR fixer," not a Datadog/Grafana replacement, and not a SaaS-only tool. The wedge is open-source, terminal-native UX plus a portable MCP server so the same DevOps operations show up wherever the engineer already works. The web is a read-only projection of the same execution graph.

### What a daily surface looks like

| Surface | Status | Mechanism |
|---|---|---|
| CLI invocation of operations | shipped | `orchentra <verb>` against the operations registry |
| MCP server (stdio) for external agents | shipped (Phase 1A) | `orchentra mcp serve` exposes operations as MCP tools |
| MCP server (HTTP) + hosted | next (Phase 1B) | bearer auth + `x-orchentra-org` header + Cloudflare Worker scaffold |
| CI failure triage | shipped | `kind='ci_failure'` from GitHub `workflow_run` webhook |
| On-call alerting | shipped | `kind='alert'` from Sentry webhook (extend to Datadog/PagerDuty on real demand) |
| Cron / scheduled ops | shipped | `kind='cron'` driven by `cronSpecs` table |
| Deploy gating / canary | future | new `kind='deploy'` |
| Cross-execution diff (postmortem, A/B) | future Phase 4 | web projection of graph |
| Runbook automation | partial | promote skills to first-class graph nodes |

Every new feature must answer: **what `Operation` does it add (or extend), and what `execution.kind` / node type does it produce?** If it doesn't fit the operations contract or the graph, we don't build it.

---

## 2. Roadmap status

**No phase rewrites a working module.** Phase gating: if verification fails, the next phase doesn't start.

| Phase | Description | Status | Reference |
|---|---|---|---|
| 1 | Generalize `incidents`/`tool_calls` → `executions`/`nodes` (with aliases for one release) | shipped | PR #209 / `fa636d5` |
| 1A | Operations contract (`@orchentra/operations`) + stdio MCP server (`@orchentra/mcp-server`) + `orchentra mcp serve` | shipped | PR #295 / `7bde111` |
| 1B | HTTP MCP transport, real approval gate, hosted Cloudflare Worker scaffold | **next** | TBD |
| 2 | New execution kinds: Sentry `alert` + `cron` | shipped | PR #218 / `e0db7dc` |
| 3 | `orchentra graph <executionId>` + `orchentra why <nodeId>` | queued (after 1B) | TBD |
| 4 | Web becomes read-only projection + cross-execution diff | partial (live timeline #225) | TBD |
| 5 | Pick next adapter from real usage data | gated on usage | — |

Side-shipped (outside the phase plan but landed): per-org LLM config (#226), test architecture refactor (#220–#224, mock-github-service / mock-openrouter-service / JobQueue DI), live agent investigation timeline (#225).

### Next up — Phase 1B

Phase 1B promotes the MCP server from a local stdio process to a remote-callable surface. It adds an HTTP transport on top of the same operations registry, an `Authorization: Bearer` token check, an `x-orchentra-org` header for tenant scoping, a real approval gate for write-class operations (replacing the placeholder), and a Cloudflare Worker scaffold so the hosted variant ships behind the same contract. No new operations land in 1B — the contract is frozen; only the transport, auth, and approval enforcement change.

### Verification per phase

- **Phase 1B ships when**: an external MCP client can invoke a read-class operation over HTTP with a bearer token AND a write-class operation triggers the approval gate AND the Worker scaffold deploys with the same operations registry binary.
- **Phase 3 ships when**: `orchentra graph <id>` matches dashboard structure AND `orchentra why <nodeId>` matches rationale logged in `nodes.argsJson`.
- **Phase 4 ships when**: dashboard renders graph view for any `kind` without per-kind code AND cross-execution diff renders for two deploys.

---

## 3. Before you write any code

This sequence is non-negotiable. It exists because we got burned skipping it.

1. **Check `~/.claude/skills/` (or project `.claude/skills/`)** for a matching skill via the `Skill` tool. Match by intent: building a feature → `to-prd` then `to-issues` then `tdd`. Refactoring → `improve-codebase-architecture`. Domain question → `domain-model` or `grill-me`. Reviewing a refactor approach → `request-refactor-plan`. Ignore at your peril.
2. **Required workflow chain for any non-trivial feature**:
   - `to-prd` — synthesize a PRD from current context, file as a GitHub issue.
   - `to-issues` — break the PRD into **tracer-bullet vertical slices** (each slice cuts through schema → API → UI → tests). Many thin slices > few thick ones.
   - `tdd` — red → green → refactor, **vertical** not horizontal. One test → one impl → repeat. Tests verify behavior through public interfaces, not implementation details.
3. **Hardening at session start (one-time per repo)**: `setup-pre-commit` (Husky + lint-staged + typecheck + tests) and `git-guardrails-claude-code` (block `push`, `reset --hard`, `clean -f`, `branch -D`, `checkout .`).
4. **Cut a new branch for new work.** Do not stack new features on a branch that already has unrelated commits.

---

## 4. Coding principles

Anti-LLM-bloat rules. Adopted from Karpathy's observations on common LLM coding pitfalls; folded directly into our own playbook so we don't import a third-party skill we don't control.

### 4.1 Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name the unclear thing. Ask.

### 4.2 Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

The test: would a senior engineer call this overcomplicated? If yes, simplify.

### 4.3 Surgical changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even when you'd do it differently.
- Notice unrelated dead code? Mention it; don't delete it.
- Remove imports/variables/functions **your** changes orphaned. Don't remove pre-existing dead code unless asked.

The test: every changed line traces directly to the user's request.

### 4.4 Goal-driven execution

Define success criteria. Loop until verified.

| Imperative ask | Verifiable goal |
|---|---|
| "Add validation" | "Write tests for invalid inputs, then make them pass" |
| "Fix the bug" | "Write a test that reproduces it, then make it pass" |
| "Refactor X" | "Tests pass before and after" |

For multi-step tasks, state a brief plan upfront:

```
1. [step] → verify: [check]
2. [step] → verify: [check]
3. [step] → verify: [check]
```

Strong success criteria let the loop run independently. Weak criteria ("make it work") force constant clarification.

### Tradeoff note

Bias is **caution over speed**. Trivial typo fixes don't need full rigor. Non-trivial work always does.

---

## 5. Branch + commit hygiene

These rules come from incidents on this repo. Honor them.

- **New work → new branch.** Always. Naming: `feat/<area>-<short-name>`, `fix/<area>-<short-name>`, `cleanup/<area>`.
- **5–10+ atomic commits per branch is the goal.** Each commit does one thing and is independently revertable.
- **Commit message style**: conventional (`feat(server): …`, `fix(cli-api): …`, `test-arch(server): …`). Subject ≤ 70 chars. No emoji. No "Generated with Claude Code." No `Co-Authored-By: Claude` line. Reference issue numbers (`(#218)`) when merging via PR.
- **Never commit**: reference codebases (`claw-code-main-3/` etc.), `.claude/*.md` planning notes, lockfile churn unrelated to dependency changes, `.tsbuildinfo` artifacts, `.env`, credentials.
- **Pre-commit hook failures are signals, not noise.** If lint/typecheck/test fails, fix the underlying issue. Never `--no-verify`.
- **`git push`, `reset --hard`, `clean -f`, `branch -D` are blocked by the guardrails hook.** That is intentional. Ask the human before bypassing.

---

## 6. CLI design north star

The CLI is the product surface. These patterns come from studying `claw-code-main-3/rust/crates/rusty-claude-cli/`, our own existing surface, and the Claude Code aesthetic the user explicitly anchored to.

### Patterns we follow

- **`/doctor` first-run preflight.** Inside the REPL and as `orchentra doctor`. Reports environment health: auth, server connectivity, repo status, missing env vars. Exit code maps to severity for scripting.
- **`--output-format json` on every diagnostic verb.** Machine-readable structured output (`created[]` / `updated[]` / `skipped[]` arrays). Idempotent operations report what they did per-artifact, not via prose substring matching.
- **`orchentra init` scaffolds local config.** Creates `.orchentra/` config dir, optional CLAUDE.md guidance, `.gitignore` entries. Idempotent — second run reports `skipped`, never overwrites.
- **`orchentra mcp serve` exposes the operations registry as an MCP server over stdio.** External MCP clients (Claude Desktop, Cursor, Windsurf) wire it in via their `mcpServers` config. Same operations registry the CLI verbs hit. Phase 1B adds an HTTP transport behind bearer auth.
- **Resume model.** Sessions persist at `~/.config/orchentra/sessions/`. `--resume latest` re-enters the most recent session. Same session id can stream across CLI + web.
- **Slash commands as the primary verb surface.** `/login`, `/help`, `/doctor`, `/<skill>` (auto-registered from `.orchentra/skills/`), `/graph`, `/why`. The same registry powers terminal + future web + future Slack.
- **Streaming everywhere.** Long-running output uses `live-cli-factory.ts`. Phase headers, tool indicators, summary block. `esc` interrupts; `ctrl+c` twice exits.
- **Reasoning is collapsible.** `ctrl+r` toggles. Default collapsed. Lifted directly from Claude Code.
- **Tool calls render as `⏺ name(args)` with `⎿`-tree results.** Diff results auto-detected and syntax-coloured. Borderless cards, pill-style tabs. Mascot stays in the welcome banner.

### Patterns we deliberately reject

- Re-introducing the welcome-scene leaf. Tried four times; not happening.
- Renaming the binary to `orch`. Gratuitous churn.
- Embedding observability infra (GreptimeDB, NATS, OTel Collector, MCP catalog) ahead of customer demand.
- Inventing a new query DSL. PromQL + SQL when we get there.
- Web write-paths. The web is read-only over the execution graph.

---

## 7. Module map

| Module | Lives in | Notes |
|---|---|---|
| Operations Contract | `packages/operations` (`@orchentra/operations`) | single typed `Operation` shape (Zod input/output, trust class, handler). Source of truth for every CLI verb and MCP tool. |
| MCP Server | `packages/mcp-server` (`@orchentra/mcp-server`) | stdio transport today; exposes the operations registry as MCP tools. HTTP transport + bearer auth land in Phase 1B. |
| Execution Engine | `apps/server/src/agent/runner.ts`, `agent-event-bus.ts` | LLM-loop today; needs node-typed dispatch beyond tool_calls |
| Decision Engine | `apps/server/src/agent/{prompts,tool-registry}.ts` | branches on `execution.kind`; rationale is logged to `nodes.argsJson` |
| Observability Substrate | `apps/server/src/db/`, `nodes` table | event-tied; future `query(filter) → events` API |
| CLI Surface | `apps/cli/src/commands/*` | rich (triage, investigate, fix, brief, watch, login, `mcp serve`). Add `graph.ts` + `why.ts` for Phase 3. |
| Web Surface | `apps/web/app/` | constrain to read-only projection (Phase 4) |
| Integration Adapters | `apps/server/src/routes/{webhooks,sentry}.ts`, `apps/server/src/github/*` | one adapter = one webhook source = one `kind` |

### Critical files for Phase 3

- `apps/cli/src/commands/builtin/graph.ts` (new) — streams ASCII tree of `nodes` for an execution.
- `apps/cli/src/commands/builtin/why.ts` (new) — walks `parent_node_id`, prints inputs + rationale.
- `apps/server/src/routes/executions.ts` (extend) — `GET /api/executions/:id/graph`, `GET /api/nodes/:id/lineage`.
- `packages/cli-core/src/render/graph-tree.ts` (new) — shared formatter so Phase 4 web reuses the same tree shape.

### Module design rule

**Deep modules over shallow.** A deep module has a small interface hiding a large implementation (Ousterhout). Test at the boundary, not inside. If you find yourself extracting pure functions just for testability, you probably created a shallow module — fold it back and test the boundary instead. The `improve-codebase-architecture` skill is the canonical guide.

---

## 8. TUI style guide

Anchored to Claude Code's aesthetic. Borderless cards. Pill-style active tab. Interactive arrow-key navigation. Hint footer. **Never destroy the mascot.**

- Banner: 3-line compact form (mascot side-by-side with title / model / cwd).
- Footer: single line when idle (model · git:(branch) · cost-if-any · mode-pill if non-default). While a turn runs: spinner + shimmering "thinking…" + elapsed + `(esc to interrupt)`.
- Hints behind `?`. Don't compete for visual weight every frame.
- Tool-call rows: `⏺ name(args)` brand glyph; `⎿` tree for results.
- Diffs auto-rendered (add=green, del=red, hunk=cyan, meta=dim).
- Reasoning blocks: collapsed by default (`✦ thought for 12s · ctrl+r to expand`), expanded shows full text in dim italic. Streaming: `✦ thinking… 12s`.
- Markdown: subset parser handles fenced code (with lang label + border), headers, lists, blockquotes, inline code/bold/italic.
- Welcome card on first run only (`~/.config/orchentra/.welcomed` marker). Greeting uses `$USER`. Four numbered tips: `/login`, paste a log, `/help`, `SKILL.md`.

---

## 9. Out of scope (year one)

- APM, infra-cost optimization, hosting customer code, mobile, on-prem.
- Slack delivery surface (`slack_channel`, `slack_message_ts` columns are unused — no customer ask yet).
- `check_run` / `check_suite` GitHub events — `workflow_run` covers the primary failure flow.
- ZITADEL / SCIM / SAML enterprise auth.
- Server-side MCP catalog promotion (partial in `packages/cli-tools` — promote when ≥1 customer asks).
- GreptimeDB / NATS / OTel Collector adoption — observability is a derivative of the graph, not a separate stack.
- Theme picker first-run flow — separate CLI polish track.

If a request lands in this list, reply with the policy + offer the smallest valid path forward (e.g., "out of plan; the closest in-plan move is X").

---

## 10. Decisions worth remembering

- **Schema migration is real, aliases are temporary.** `incidents` and `toolCalls` re-export `executions` and `nodes` for one release. Drop the aliases when no caller imports them.
- **Web ships in parallel, not after.** It is a projection of the graph. No write paths.
- **`why` audit ships against existing data.** `nodes.argsJson` + `resultJson` already store inputs and rationale. No new instrumentation required.
- **Adapter expansion is usage-gated.** Phase 5 has no scheduled deliverable. It opens when usage data exists.
- **The CLI binary stays `orchentra`.** Already published. Renames to `orch` are rejected.
- **Drop "replace Datadog" as a build target.** Sales narrative. Build target is execution-tied observability for what runs through us.
- **CLI UX track runs in parallel and ships independently.** TUI aesthetic changes do not gate roadmap phases. Branch them separately.

---

## 11. Quick reference

| Need | Skill / file |
|---|---|
| Plan a new feature from conversation context | `to-prd` skill |
| Break a plan into shippable issues | `to-issues` skill (vertical slices) |
| Implement an issue | `tdd` skill (red → green → refactor, vertical) |
| Stress-test a design | `grill-me` or `domain-model` skill |
| Find refactor opportunities | `improve-codebase-architecture` skill |
| Set up commit-time guardrails | `setup-pre-commit` + `git-guardrails-claude-code` skills |
| Replace `as` in tests | `migrate-to-shoehorn` skill |
| Triage GitHub issues | `github-triage` or `triage-issue` skill |
| Sharpen vocabulary | `ubiquitous-language` skill |

When unsure, default to checking the skill list with the `Skill` tool and pick the closest match. Skills evolve; always read the current version, do not work from memory of the skill's contents.

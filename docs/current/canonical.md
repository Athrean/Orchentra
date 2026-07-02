# Canonical Agent Contract

This is the only doc that defines **what we're building** and **how to build it**. Read it before starting any new feature. Update it intentionally when the plan changes — do not let it rot.

Last refresh: 2026-07-02. **This is the single canonical doc.** Root `AGENTS.md`, root `CLAUDE.md`, and `README.md` point here; current build queue lives in [`roadmap.md`](roadmap.md).

---

## 1. Vision

**Orchentra is a CLI-first coding crew that spends fewer tokens and writes less, better code than Claude Code and Codex.** The wedge is **efficiency + trust**, delivered by a shared agent spine. It is **CLI-only and zero-DB**; the only web surface is a static marketing site.

### The spine (the actual product)

Every built-in agent is **composed from three always-on skills**. The spine — not the agent names — is the moat:

| Spine skill           | Job                                                                                     | Saves                   |
| --------------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| **output discipline** | terse output — fragments, no filler; never touches code, paths, or safety text          | output tokens           |
| **context budget**    | context budgeting + live-zone compaction + dollar/step budget governor                  | input tokens + $ spend  |
| **lean code**         | lean code discipline (YAGNI → stdlib → native → existing dep → one line → minimum code) | lines of code (quality) |

So: **output discipline + context budget = fewer tokens; lean code = less, better code.** Names are brand; the composed spine is the differentiation vs Claude Code / Codex.

### Specialist agents (spine + task focus)

- **`/plan`** — architect. Turns a need into the best stack + named alternatives and scaffolds the directory + architecture.
- **senior-dev** — builder. Implements via TDD, delegates parallel slices to subagents, capped by context budget.
- **`/review`** — verifier. Proposes findings **and verifies by running** tests / types / repro — never trusts its own prose. Code review lives **in the CLI**; there is no web reviewer.

Keep the lineup small; each agent must earn its place. `founder` and other domain skills stay optional, not headline built-ins.

### The web — marketing site only

The only web surface is a **static, zero-DB marketing site** for the CLI (`apps/web`, Next.js, light/minimalist). No auth, no onboarding, no GitHub App, no database, no product features. It sells the CLI; it never imports CLI packages and holds no shared store. Positioning anchor: commandcode.ai-style landing.

One-liner: **the coding crew that spends less, writes less, and proves its review by running the code.**

Every new feature must answer: **does it save tokens, make the agent write less/better code, or make a review verifiable?** If not, we don't build it. Output and context compression are always cosmetic/transport — they never alter a safety-relevant or trust-boundary message.

**The product is CLI-only and zero-DB.** The DevOps operations backend (`apps/server`, operations / mcp-server / db / core packages, Postgres) and the entire DB-backed web product (Supabase, Drizzle, `lib/db`, dashboards, the planned web AI reviewer) were **removed**. No new DB/ORM/server work — everything ships via the CLI + git.

---

## 2. Roadmap status

**Current build queue lives in [`roadmap.md`](roadmap.md)** — CLI phases: spine-as-first-class -> specialist agents (`/plan`, senior-dev) -> `/review` verifier -> cheap learning loop. **The web AI reviewer phase is cancelled** (CLI-only, zero-DB pivot). Each phase uses the smallest applicable planning/build/review/lean loop; every specialist agent inherits the spine.

**Shipped foundation:** agent loop (`cli-core` `ConversationRuntime`), tool surface (`cli-tools` — bash/file/glob/grep/web + read-only git tools + MCP client), JSONL sessions/replay, permissions + hooks, compaction, **dollar budget**, `/memory` `/forget` `/debug` `/effort` `/think` `/plan` `/review`, **failure signatures + secret redaction + auto-capture** (PRs #453–#465).

**No phase rewrites a working module.** Verification gates each phase; if tests fail, the next phase doesn't start. The old DevOps phase table (incidents→executions, operations contract, mcp-server, graph, web projection) is **historical** — those packages were removed in the CLI-only cut.

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

| Imperative ask   | Verifiable goal                                       |
| ---------------- | ----------------------------------------------------- |
| "Add validation" | "Write tests for invalid inputs, then make them pass" |
| "Fix the bug"    | "Write a test that reproduces it, then make it pass"  |
| "Refactor X"     | "Tests pass before and after"                         |

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
- **Commit message style**: conventional (`feat(cli): ...`, `fix(cli-api): ...`, `test(cli-core): ...`). Subject <= 70 chars. No emoji. No "Generated with Claude Code." No `Co-Authored-By: Claude` line. Reference issue numbers (`(#218)`) when merging via PR.
- **Never commit**: reference codebases (study material we vendor in locally), `.claude/*.md` planning notes, lockfile churn unrelated to dependency changes, `.tsbuildinfo` artifacts, `.env`, credentials.
- **Pre-commit hook failures are signals, not noise.** If lint/typecheck/test fails, fix the underlying issue. Never `--no-verify`.
- **`git push`, `reset --hard`, `clean -f`, `branch -D` are blocked by the guardrails hook.** That is intentional. Ask the human before bypassing.

---

## 6. CLI design north star

The CLI is the product surface. These patterns come from studying a reference open-source Rust CLI, our own existing surface, and the Claude Code aesthetic the user explicitly anchored to.

### Patterns we follow

- **`/doctor` first-run preflight.** Inside the REPL and as `orchentra doctor`. Reports environment health: auth, provider readiness, repo status, missing env vars. Exit code maps to severity for scripting.
- **`--output-format json` on every diagnostic verb.** Machine-readable structured output (`created[]` / `updated[]` / `skipped[]` arrays). Idempotent operations report what they did per-artifact, not via prose substring matching.
- **`orchentra init` scaffolds local config.** Creates `.orchentra/` config dir, optional CLAUDE.md guidance, `.gitignore` entries. Idempotent — second run reports `skipped`, never overwrites.
- **MCP client, not hosted MCP server.** `orchentra mcp list` and `orchentra mcp test <server>` inspect configured MCP servers. The removed operations-registry MCP server is not active.
- **Resume model.** Sessions persist at `~/.config/orchentra/sessions/<cwd-hash>/` (per-workspace fingerprint). `--resume latest` re-enters the most recent session for the current cwd.
- **Slash commands as the primary verb surface.** `/login`, `/help`, `/doctor`, `/theme`, `/<skill>` (auto-registered from `.orchentra/skills/`), `/plan`, `/build`, and `/review`. Short aliases must remain collision-free; the registry should reject duplicates instead of silently overwriting.
- **Streaming everywhere.** Long-running output uses `live-cli-factory.ts`. Phase headers, tool indicators, summary block. `esc` interrupts; `ctrl+c` twice exits.
- **Reasoning is collapsible.** `ctrl+r` toggles. Default collapsed. Lifted directly from Claude Code.
- **Tool calls render as `⏺ name(args)` with `⎿`-tree results.** Diff results auto-detected and syntax-coloured. Borderless cards, pill-style tabs. Mascot stays in the welcome banner. Completed tool rows dim to `mutedText` after 5 seconds so the eye is drawn to the most recent active call.
- **Multi-line input modal.** Inline input below 5 wrapped rows; swaps to a bordered modal overlay (`✦ multi-line edit · ctrl+x ctrl+e for $EDITOR · esc to collapse`) at the threshold. Esc collapses without losing the buffer.
- **`ctrl+x ctrl+e` opens current input in `$EDITOR`.** Two-key chord (single key conflicts). Tempfile round-trip preserves edits.
- **`/theme` picker with 6 built-in palettes.** `dark`, `light`, `dark-ansi`, `solarized-dark`, `solarized-light`, `high-contrast`. Selection persists to `~/.config/orchentra/session.json`. High-contrast passes WCAG AAA against black terminals.
- **Pre/post tool-use hooks.** Drop a `.orchentra/hooks.json` into a repo; shell commands fire around every tool call in that workspace's REPL. Pre-hook non-zero exit blocks the tool with stderr as the reason. Reload on CLI restart only — no mid-session re-read.

### Patterns we deliberately reject

- Re-introducing the welcome-scene leaf. Tried four times; not happening.
- Renaming the binary to `orch`. Gratuitous churn.
- Embedding observability infra (GreptimeDB, NATS, OTel Collector, MCP catalog) ahead of customer demand.
- Inventing a new query DSL. PromQL + SQL when we get there.
- Any web product surface. The web is a **static marketing site only** — no auth, no DB, no GitHub App, no dashboards. It never imports `apps/cli` and holds no shared store.

---

## 7. Module map

| Module               | Lives in                                                 | Notes                                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI Surface          | `apps/cli/src/commands/*`                                | the coding agent: REPL, file/bash/glob/grep/web tools, MCP client, sessions/replay, auth, init, doctor, scan, commit/pr/issue.                                                                                                                                 |
| Web — Marketing site | `apps/web/app/`                                          | static, zero-DB Next.js landing page that sells the CLI (light/minimalist). No auth, DB, GitHub App, or product features; never imports the CLI.                                                                                                               |
| Agent Runtime (CLI)  | `packages/cli-core/src/runtime`                          | `ConversationRuntime` — the CLI agent loop (stateless, step lifecycle, budget, spans) + provider abstraction, compaction, hooks, permissions, skills, session replay, `worker-boot`. **The** agent loop. **Where context budget compaction/budget grafts in.** |
| Agent Tools (CLI)    | `packages/cli-tools/src`                                 | general tool surface (bash/file/glob/grep/web/git/task/agent/ask-user) + an MCP **client** (`mcp/`, stdio+http) + `file-ops`. **Where tool-output budgeting + the verify-by-running checker graft in.**                                                        |
| Agent Spine + Agents | skills + `.orchentra/hooks.json` + grafts into the above | the spine (output discipline, context budget, lean code) + specialist agents (`/plan`, senior-dev, `/review`). **No new runtime package** — composed from skills/agents/hooks. Queue in [`roadmap.md`](roadmap.md).                                            |
| Memory               | `packages/cli-core/src/memory` + `packages/brain`        | PatternStore (JSON), embeddings/similarity, failure signatures + secret redaction, auto-capture. `brain` holds episode/runbook/skill-export types. No DB.                                                                                                      |

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
- Chat delivery surfaces outside the terminal.
- `check_run` / `check_suite` GitHub events — `workflow_run` covers the primary failure flow.
- ZITADEL / SCIM / SAML enterprise auth.
- Server-side MCP catalog promotion (partial in `packages/cli-tools` — promote when ≥1 customer asks).
- GreptimeDB / NATS / OTel Collector adoption — not part of the CLI wedge.
- Theme picker first-run flow — separate CLI polish track. The picker itself ships (`/theme`) but a guided first-run prompt does not.
- User-defined themes via `~/.config/orchentra/themes/<name>.json` — built-in registry ships 6 themes; JSON drop-ins gated on demand.
- Hook hot-reload + timeout policy — hooks today reload only on CLI restart and have no timeout; revisit when an operator hits the friction.
- Multi-host adapter sprawl (Cursor/Windsurf/Cline rule-file copies) — Orchentra is terminal + MCP only; the efficiency skills do not ship per-host adapters.
- Autonomous "autopilot" fix loops with a $/token ledger — gated on a real unattended use case.
- ML-model-based prose compression (HF/ONNX dependency) — too heavyweight for CLI scope; use grammar-based + type-routed compression instead.
- Importance-score history dropping for compression — a known dead end (it busts provider prefix caching). Compress only the live zone (newest turn/tool result); never rewrite or reorder sent history.

If a request lands in this list, reply with the policy + offer the smallest valid path forward (e.g., "out of plan; the closest in-plan move is X").

---

## 10. Decisions worth remembering

- **CLI-only, zero-DB pivot (2026-06-25).** The whole product is the CLI; everything ships via CLI + git. **No DB, ORM, server, or web product** anywhere. The entire DB-backed web product (Supabase, Drizzle, `lib/db`, GitHub App, dashboards) was deleted; `apps/web` is now a **static marketing site only**. The web AI reviewer is **cancelled** — code review stays in the CLI (`/review`). Supersedes every "web = standalone DB-backed product / shared store" decision below.
- **Credit-resale = a separate opt-in hosted proxy, not the CLI (2026-06-25).** The CLI core stays **BYOK + zero-DB + no account** (privacy default — nothing phones home). Reselling credits requires a hosted proxy holding master provider keys + metering + Stripe + an accounts/balances DB; that is a **separate, deferred service** off the CLI's critical path, so the zero-DB rule still binds the CLI/marketing site. Two modes: BYOK (default, nothing leaves) vs Credit (opt-in, metered). Mirrors Command Code's BYOK-vs-credit split.
- **Distribution playbook (steal from Command Code, 2026-06-25).** Ship the CLI as a single bundled ESM on **npm** + a **short alias** (`orchentra` keeps its name; add a 2–3 char alias bin), a **closed-source release/issues-only public repo**, `alpha`/`beta`/`latest` channels, and a self-update command. Onboarding steal: import prior Claude Code / Codex sessions. **No telemetry** stays the differentiator (Command Code bundles OpenTelemetry; we do not). "Taste"-style learning = our **Phase L** (review feedback), parked until the core is sticky.
- **Wedge = efficiency + trust (2026-06-25).** CLI-first coding crew that spends fewer tokens (terse output + context budgeting) and writes less/better code (lean code discipline) than Claude Code / Codex; trust comes from `/review` verifying by running. **Supersedes** both the "DevOps company-brain" and the standalone "token-lean efficiency-layer" framings — they fold in: the efficiency layer _is_ the spine; the failure-memory work repoints at review feedback. Canonical detail here; queue in [`roadmap.md`](roadmap.md).
- **Agents are composed from skills, not new packages.** Every agent = the spine (output discipline, context budget, lean code) + task focus, grafted into `cli-core` / `cli-tools` / `brain` via skills/agents/hooks. No new runtime package. Keep the lineup small; each agent earns its place.
- **The reviewer's trust comes from running, not asserting.** `/review` proposes findings then **verifies by executing** the project's typecheck/tests/repro (the "untrusted producer, trusted checker" pattern). No formal-methods substrate — the checker is the test suite.
- **Compression is reversible, validated, and live-zone-only.** Never drop or reorder already-sent history (busts prefix caching); always recoverable via a `retrieve_original` op; only kept when a real tokenizer confirms a shrink. Trust-boundary / approval messages are never compressed.
- **The product ships zero-DB.** No database import anywhere; the agent loop, tools, and sessions persist to local files (JSONL). Memory is **local-first** via `brain`'s adapter (`LocalFileBrainAdapter` default). Postgres/Drizzle/Supabase were **deleted** in the CLI-only pivot — do not reintroduce them.
- **Web is a static marketing site (2026-06-25 — supersedes the two web decisions that were here).** `apps/web` is a zero-DB Next.js landing page that sells the CLI. The former standalone DB-backed web product (own auth, onboarding, GitHub App, repo subscriptions, dashboards) and its Supabase/Drizzle data layer were **deleted**. No DB, no migrations, no `lib/db`, no shared store.
- **Adapter expansion is usage-gated.** Phase 5 has no scheduled deliverable. It opens when usage data exists.
- **The CLI binary stays `orchentra`.** Already published. Renames to `orch` are rejected.
- **Drop "replace Datadog" as a build target.** Sales narrative. Build target is execution-tied observability for what runs through us.
- **CLI UX track runs in parallel and ships independently.** TUI aesthetic changes do not gate roadmap phases. Branch them separately.

---

## 11. Quick reference

| Need                                         | Skill / file                                             |
| -------------------------------------------- | -------------------------------------------------------- |
| Plan a new feature from conversation context | `to-prd` skill                                           |
| Break a plan into shippable issues           | `to-issues` skill (vertical slices)                      |
| Implement an issue                           | `tdd` skill (red → green → refactor, vertical)           |
| Stress-test a design                         | `grill-me` or `domain-model` skill                       |
| Find refactor opportunities                  | `improve-codebase-architecture` skill                    |
| Set up commit-time guardrails                | `setup-pre-commit` + `git-guardrails-claude-code` skills |
| Replace `as` in tests                        | `migrate-to-shoehorn` skill                              |
| Triage GitHub issues                         | `github-triage` or `triage-issue` skill                  |
| Sharpen vocabulary                           | `ubiquitous-language` skill                              |

When unsure, default to checking the skill list with the `Skill` tool and pick the closest match. Skills evolve; always read the current version, do not work from memory of the skill's contents.

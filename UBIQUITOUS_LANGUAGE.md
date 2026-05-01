# Ubiquitous Language

Domain glossary for the Orchentra agent harness work (PRD #246 and Phase A–E).

This document is the single source of truth for the names of concepts in the permissions, policy, hooks, sandbox, trust, and recovery subsystems. When a code identifier or PR description disagrees with the names here, fix the code or fix this glossary — do not let them drift.

## Permission flow

| Term                     | Definition                                                                                                                                           | Aliases to avoid              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Tool call**            | A single invocation of a registered tool by the agent loop, identified by `id`, `name`, `input`.                                                     | invocation, action, operation |
| **Permission mode**      | The user-facing dial that selects the default permissiveness for a session: `prompt`, `workspace-write`, `read-only`, `allow`, `danger-full-access`. | profile, level                |
| **Enforcer**             | The pure decision module that turns a tool call + context into an `Allow` or `Deny`. Owns the precedence order.                                      | gate, gatekeeper, guard       |
| **Decision**             | The `Allow` / `Deny` value returned by the enforcer, optionally with a `reason`.                                                                     | verdict, ruling               |
| **Prompt**               | The interactive ask-the-user step the enforcer falls through to when no rule resolves. Distinct from the `prompt` permission mode.                   | confirmation, ask             |
| **Confirmation overlay** | The Ink TUI component that renders the numbered Yes/Allow-pattern/No options.                                                                        | modal, dialog                 |
| **Choice**               | The user's response to a prompt: `yes-once`, `yes-allow-pattern`, `no`, `cancel`.                                                                    | answer, response              |
| **Permission rule**      | A `{tool, pattern, decision}` entry stored or declared.                                                                                              | grant, ACL entry              |
| **Permission store**     | The in-memory + per-workspace persistence layer for rules added at runtime via "Allow this pattern".                                                 | cache, memory                 |
| **Pattern**              | A glob string (`gh issue *`) matching tool calls.                                                                                                    | rule body, glob               |

## Policy (Phase B)

| Term                   | Definition                                                                                                                                 | Aliases to avoid |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| **Policy file**        | The user-authored declarative ruleset at `.orchentra/permissions.json`.                                                                    | config, ACL file |
| **Ruleset**            | The parsed, in-memory representation of the policy file.                                                                                   | rules, config    |
| **Policy engine**      | The pure decision module that evaluates a tool call against a ruleset. Distinct from the **enforcer** which orchestrates multiple sources. | evaluator        |
| **Command classifier** | The Bash-string parser producing `{verb, subverb, flags, args}`. Consumed by the policy engine for Bash matches.                           | tokenizer, lexer |

## Hooks (Phase C)

| Term            | Definition                                                                       | Aliases to avoid  |
| --------------- | -------------------------------------------------------------------------------- | ----------------- |
| **Hook**        | A user-defined shell script triggered by a lifecycle event around a tool call.   | trigger, callback |
| **Hook event**  | One of `pre-tool-use`, `post-tool-use`, `post-tool-failure`.                     | lifecycle, phase  |
| **Hook config** | The parsed `.orchentra/hooks.json`.                                              | hook file         |
| **Hook runner** | The module that spawns the user shell with structured env and enforces timeouts. | executor          |

## Sandbox (Phase D)

| Term                | Definition                                                                                   | Aliases to avoid |
| ------------------- | -------------------------------------------------------------------------------------------- | ---------------- |
| **Sandbox profile** | The macOS seatbelt `.sb` string generated per tool call.                                     | sandbox config   |
| **Sandbox wrap**    | The transformation that rewrites `Bun.spawn` opts to launch via `sandbox-exec -p <profile>`. | sandbox shim     |

## Trust (Phase E)

| Term               | Definition                                                                      | Aliases to avoid  |
| ------------------ | ------------------------------------------------------------------------------- | ----------------- |
| **Trust**          | The per-cwd state of `trusted` / `untrusted` / `denied`.                        | safety, allowlist |
| **Trust store**    | The persistent record at `~/.config/orchentra/trusted-dirs`.                    | trust file        |
| **Trust resolver** | The pure module that takes a cwd + store and returns `'trusted'` or `'prompt'`. | trust check       |

## Recovery (Phase E)

| Term                | Definition                                                                                                          | Aliases to avoid |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Recipe**          | A `{matcher, retries, backoff}` triple describing how to recover from a class of transient errors.                  | strategy, policy |
| **Transient error** | An error matched by a recipe. By definition, retryable. Distinct from a **terminal error** which surfaces directly. | flaky error      |
| **Backoff**         | The delay between retry attempts. Always exponential in v1.                                                         | retry interval   |

## Relationships

- An **enforcer** consults — in order — destructive blocklist, **policy engine**, **permission store**, **permission mode**, then falls through to **prompt**.
- A **prompt** renders a **confirmation overlay** and resolves to a **choice**.
- A **choice** of `yes-allow-pattern` writes a **permission rule** to the **permission store**.
- A **policy file** parses into a **ruleset**; the **policy engine** evaluates **tool calls** against it.
- A **hook** fires on a **hook event**; the **hook runner** executes it.
- A **sandbox profile** wraps the **tool call**'s spawn opts.
- A **trust resolver** consults the **trust store** before any **tool call** runs.
- A **recipe** wraps a **tool call** to recover from **transient errors**.

## Example dialogue

> **Dev:** "When the agent runs `gh issue list`, who decides whether to prompt?"
> **Maintainer:** "The **enforcer**. It checks the destructive blocklist first, then the **policy engine** against the **ruleset** loaded from `.orchentra/permissions.json`, then the **permission store** for any session-or-workspace-level **permission rules**, then the **permission mode**. Only if none of those resolves does it fall through to a **prompt** via the **confirmation overlay**."
>
> **Dev:** "If the user picks 'Yes, and allow this pattern', what happens?"
> **Maintainer:** "The **choice** is `yes-allow-pattern`. The enforcer writes a new **permission rule** with the suggested glob into the **permission store**, and the store persists it to `.orchentra/permissions.json`. Next matching **tool call** auto-allows."
>
> **Dev:** "How does this differ from the **policy file**?"
> **Maintainer:** "The **policy file** is user-authored, declarative, version-controllable. The **permission store** is runtime-accumulated from **prompt** **choices**. The **enforcer** consults policy first, store second."
>
> **Dev:** "What about a 429 mid-tool-call?"
> **Maintainer:** "A **recipe** matches it as a **transient error** and retries with **backoff**. The user only sees the wrapped error if the recipe's retry budget runs out."

## Flagged ambiguities

- "**prompt**" was used for both the permission _mode_ (`PermissionMode = 'prompt'`) and the _act_ of asking the user. Disambiguated above: the mode stays `'prompt'`; the verb/noun for asking is also "prompt" but always paired with the **confirmation overlay** when ambiguity could arise.
- "**policy**" was used loosely for both the file and the engine. Resolved: **policy file** = the JSON; **policy engine** = the evaluator; **ruleset** = the parsed in-memory shape.
- "**rule**" appeared in both the policy and the store. Resolved: a **policy rule** lives in the **policy file**; a **permission rule** lives in the **permission store**. They have the same `{tool, pattern, decision}` shape but different provenance.

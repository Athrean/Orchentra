# Roadmap

Last refreshed: 2026-07-02.

## Recently Shipped

- Static marketing site refresh, logo/favicon/head assets, and interactive hover effects.
- Publishable `@orchentra/cli` package with `orchentra` and `otr` bins.
- `orchentra update` self-update command.
- `/plan`, `/build`, `/review`, `/memory`, `/forget`, `/terse`, `/think`, `/effort`.
- `/review` check execution and finding corroboration.
- Review/build feedback memory guidance.
- Tool-output budgeting receipts.
- Terse output accounting.

## Build Order

### P0: Safety And Truth

1. Fix permission/tool-name mismatch so real tools like `read_file`, `write_file`, `edit_file`, `glob_search`, and `grep_search` are enforced.
2. Pass `workspaceRoot`, tool requirements, hook overrides, and permission mode through `ConversationRuntime`.
3. Use workspace-safe file helpers in file tool wrappers.
4. Add scenario tests that call the actual registry tool names.
5. Keep README/docs aligned with CLI-only zero-DB reality.

### P1: Make The Spine First-Class

1. Strengthen `/terse` as the output-token control.
2. Add `/budget` for cost, compaction, and tool-output controls.
3. Add `/lean` for lean-code inspection and simplification.
4. Ensure `/plan`, `/build`, `/review`, and subagents receive the same spine prompt/control bundle by default.
5. Show measured savings, not marketing estimates.

### P2: Harness And Verification

1. Expand deterministic scenarios across tool calls, permission gates, compaction, budgeting, and terse modes.
2. Tighten `/review` corroboration from basename matching to diagnostic/line-level evidence.
3. Add package/release smoke tests for packed CLI artifacts.
4. Add PR CI for leak guard, typecheck, lint, tests, and build.

### P3: Hosted Credit Proxy Proposal

Subscription management only enters through a separate hosted credit proxy if approved.

The CLI remains BYOK and zero-DB by default.

See [`../proposals/hosted-credit-proxy.md`](../proposals/hosted-credit-proxy.md).

## Not Active

- DB-backed web reviewer.
- Supabase/Drizzle web app.
- Repo subscription dashboard.
- GitHub App onboarding inside the static site.
- Rebuilding the removed operations/server stack.

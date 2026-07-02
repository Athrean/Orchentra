# Handover

Last updated: 2026-07-02.

## Current State

- The repo is clean after the P0 safety slice shipped.
- Local git identity has been corrected for future commits to `Rishit <104666906+Rish-it@users.noreply.github.com>`.
- The 12 July 2 direct commits that were accidentally authored and committed as `Test <test@example.com>` were rewritten and force-pushed with the GitHub-linked identity above.
- The file tree was verified unchanged after the author rewrite.

## Shipped This Handoff

- Marketing site refresh was merged and pushed: `0b2fa657 feat(web): add interactive marketing hover effects`.
- Product docs were cleaned and aligned under `docs/current/`: `1367a97a docs: align current product docs`.
- P0 permission safety was merged and pushed: `0c4412a9 fix(cli): wire permission safety for real tools`.

## P0 Safety Details

- `ConversationRuntime` now passes `permissionMode`, `workspaceRoot`, hook overrides, and registry-derived tool requirements into the rich enforcer.
- `LiveCli` now derives permission requirements from registered built-in, custom, and MCP tool levels.
- The enforcer recognizes real tool names such as `read_file`, `write_file`, `edit_file`, `glob_search`, and `grep_search`.
- Admin tools such as `web_search` no longer pass through read auto-allow.
- File, search, and notebook tools enforce workspace boundaries from `ctx.cwd`, including parent traversal and symlink escapes.
- Bash validation uses the active permission mode.
- CLI hooks match tool names case-insensitively and preserve JSON permission decisions.

## Verification

- `bun run typecheck` passed.
- `bun run lint` passed.
- `bun run test:precommit` passed with 1729 tests.
- The commit hook also passed typecheck and tests.

## Next Build Queue

- P1: make the spine first-class with `/budget`, `/lean`, and shared spine controls across `/plan`, `/build`, `/review`, and subagents.
- P2: expand harness coverage across real tool calls, permission gates, compaction, budgeting, and terse modes.
- P2: tighten `/review` corroboration from basename-level matching to diagnostic and line-level evidence.
- P2: add packed CLI release smoke tests and PR CI gates.

## Guardrails

- Keep the product CLI-only and zero-DB.
- Keep `apps/web` as static marketing only.
- Start new work on a branch.
- Check `git config --get user.name` and `git config --get user.email` before committing.
- Never bypass pre-commit or leak guard.

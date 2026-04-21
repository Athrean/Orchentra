# Git and PR Workflow

Rules for branching, committing, and pull requests.

## Scope

- All repositories in the Orchentra workspace.

## Context

- Orchentra uses Bun as its runtime (`#!/usr/bin/env bun` in CLI entry points).
- The monorepo uses Turborepo for build orchestration.
- Every branch must get a PR before merge. No direct merges to main.

## Rules

- [R1] Always create a new branch: `feat/`, `fix/`, `refactor/`, or `chore/`.
- [R2] One logical change per commit. No mixed commits.
- [R3] Commit messages must be concise, imperative mood, and issue-aligned.
- [R4] Never include AI co-author attributions or AI-related mentions in commits.
- [R5] Every branch gets a PR. No exceptions.
- [R6] PR must include: problem statement, changes summary, trade-offs, and verification evidence.
- [R7] Wait for review approval before merging.

## Examples

### Good commit messages

```
fix(webhook): deduplicate concurrent events with in-memory map
feat(cli): add REPL loop with streaming renderer
```

### Bad commit messages

```
fix stuff
Co-Authored-By: Some Bot <bot@example.com>
wip
```

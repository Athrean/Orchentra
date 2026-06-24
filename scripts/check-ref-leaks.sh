#!/bin/sh
# Pre-commit guard: block staged content from naming vendored reference
# codebases (CLAUDE.md: never name other codebases in code/comments/PRs).
#
# The token list is LOCAL ONLY — .orchentra/ref-blocklist.txt (gitignored) — so
# the names themselves never live in tracked history (committing them would be
# the very leak this guards against). One token per line, '#' comments allowed;
# matching is substring, case-insensitive. Add new reference names there as you
# vendor them.
set -eu

ROOT="$(git rev-parse --show-toplevel)"
LIST="$ROOT/.orchentra/ref-blocklist.txt"

if [ ! -f "$LIST" ]; then
  echo "ref-leak guard: $LIST not found — skipping. Create it to enable the guard." >&2
  exit 0
fi

TOKENS="$(grep -vE '^[[:space:]]*(#|$)' "$LIST" | sed 's/[[:space:]]*$//' | paste -sd '|' -)"
[ -n "$TOKENS" ] || exit 0

# Scan only added lines of the staged diff (added/copied/modified files).
HITS="$(git diff --cached --unified=0 --no-color --diff-filter=ACM \
  | grep -E '^\+' | grep -vE '^\+\+\+' \
  | grep -niE "$TOKENS" || true)"

if [ -n "$HITS" ]; then
  echo "" >&2
  echo "✖ ref-leak guard blocked this commit — staged content names a reference codebase:" >&2
  printf '%s\n' "$HITS" | sed 's/^/    /' >&2
  echo "  Rename/remove it before committing (see CLAUDE.md branch + commit hygiene)." >&2
  exit 1
fi

exit 0

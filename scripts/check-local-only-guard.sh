#!/bin/sh
# Pre-commit guard for code that must never reach git history.
#
# Layer 1 — any branch under local/ is permanently uncommitted. Nothing on
# such a branch may ever be committed; move code you want to ship to a real
# feature branch first.
#
# Layer 2 — on ANY branch, block staging files listed in
# .orchentra/local-only-blocklist.txt (gitignored, local only — never
# tracked, so this script names no paths) as a backstop against `git add -f`.
set -eu

ROOT="$(git rev-parse --show-toplevel)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

case "$BRANCH" in
  local/*)
    echo "" >&2
    echo "✖ guard blocked this commit — branch '$BRANCH' is local-only and must never be committed." >&2
    echo "  Move any code you actually want to ship to a real feature branch first." >&2
    exit 1
    ;;
esac

LIST="$ROOT/.orchentra/local-only-blocklist.txt"
[ -f "$LIST" ] || exit 0

STAGED="$(git diff --cached --name-only --diff-filter=ACM)"
[ -n "$STAGED" ] || exit 0

HITS=""
while IFS= read -r pattern; do
  case "$pattern" in
    ''|'#'*) continue ;;
  esac
  MATCH="$(printf '%s\n' "$STAGED" | grep -F "$pattern" || true)"
  [ -n "$MATCH" ] && HITS="$HITS$MATCH
"
done < "$LIST"

if [ -n "$HITS" ]; then
  echo "" >&2
  echo "✖ guard blocked this commit — staged file must stay local-only:" >&2
  printf '%s' "$HITS" | sed 's/^/    /' >&2
  echo "  See .orchentra/local-only-blocklist.txt for why. Must never be committed." >&2
  exit 1
fi

exit 0

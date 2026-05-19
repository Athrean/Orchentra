#!/bin/sh
# Stub editor used by external-editor tests. The desired post-edit
# content is read from $STUB_EDITOR_CONTENT and written over the tmpfile
# passed in $1, then exits with $STUB_EDITOR_EXIT (defaults to 0).
set -eu
if [ -n "${STUB_EDITOR_CONTENT-}" ]; then
  printf '%s' "$STUB_EDITOR_CONTENT" >"$1"
fi
exit "${STUB_EDITOR_EXIT:-0}"

#!/bin/sh
# Writes a reason to stderr and exits 1 to block a pre-hook.
echo "blocked by fixture" >&2
exit 1

#!/usr/bin/env bash
#
# Compile per-architecture standalone binaries for the Orchentra CLI.
#
# Usage:
#   ./scripts/build-binaries.sh            # build all 4 targets
#   ./scripts/build-binaries.sh host       # build only the host target
#   ./scripts/build-binaries.sh darwin-arm64 [linux-x64 ...]   # explicit list
#
# Outputs land in apps/cli/dist/orchentra-<target>.
#
# Targets supported by `bun build --compile --target`:
#   bun-darwin-arm64, bun-darwin-x64, bun-linux-x64, bun-linux-arm64
#
# See https://bun.com/docs/bundler/executables.

set -euo pipefail

# cd to apps/cli so relative paths are stable regardless of caller cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

ALL_TARGETS=(darwin-arm64 darwin-x64 linux-x64 linux-arm64)

# Resolve host triple in the same shape we use for outfile names.
host_triple() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "${os}" in
    darwin) os="darwin" ;;
    linux) os="linux" ;;
    *)
      echo "error: unsupported host OS '${os}' (only darwin / linux supported)" >&2
      exit 2
      ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) arch="arm64" ;;
    x86_64 | amd64) arch="x64" ;;
    *)
      echo "error: unsupported host arch '$(uname -m)'" >&2
      exit 2
      ;;
  esac
  echo "${os}-${arch}"
}

# Validate a target string and emit it; exit 2 on bad input.
validate_target() {
  local t="$1"
  for known in "${ALL_TARGETS[@]}"; do
    if [[ "${t}" == "${known}" ]]; then
      echo "${t}"
      return 0
    fi
  done
  echo "error: unknown target '${t}'. Valid: ${ALL_TARGETS[*]}" >&2
  exit 2
}

# Resolve argv -> list of targets.
TARGETS=()
if [[ $# -eq 0 ]]; then
  TARGETS=("${ALL_TARGETS[@]}")
elif [[ "$1" == "host" ]]; then
  TARGETS=("$(host_triple)")
else
  for arg in "$@"; do
    TARGETS+=("$(validate_target "${arg}")")
  done
fi

mkdir -p dist

for target in "${TARGETS[@]}"; do
  outfile="dist/orchentra-${target}"
  echo ">> compiling ${target} -> ${outfile}"
  # NOTE: react-devtools-core is a peer of ink loaded only when DEV=true. It
  # ships as a devDependency so the compile step can resolve it; the runtime
  # path stays gated behind `process.env.DEV === 'true'` (see ink's
  # reconciler.js), so this adds zero overhead to production startup.
  bun build \
    --compile \
    --target="bun-${target}" \
    src/main.ts \
    --outfile "${outfile}"
done

echo ">> done. built ${#TARGETS[@]} binar$([ ${#TARGETS[@]} -eq 1 ] && echo 'y' || echo 'ies') in $(pwd)/dist"

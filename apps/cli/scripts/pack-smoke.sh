#!/usr/bin/env bash
#
# Smoke test for the packed @orchentra/cli npm artifact.
#
# Packs the package (prepack runs build + package:verify), installs the
# tarball into a throwaway directory, and asserts the orchentra/otr bins
# exist and answer --version / --help outside the monorepo. The package
# has no runtime dependencies, so the install never touches the network.
#
# Usage: ./scripts/pack-smoke.sh   (or: bun run test:smoke)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

PKG_VERSION="$(bun -e "console.log(require('./package.json').version)")"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

echo ">> packing @orchentra/cli@${PKG_VERSION}"
TARBALL="${WORK}/$(npm pack --pack-destination "${WORK}" | tail -n1)"

echo ">> installing $(basename "${TARBALL}") into ${WORK}/install"
mkdir "${WORK}/install"
cd "${WORK}/install"
printf '{"name":"smoke","private":true}\n' > package.json
BUN_INSTALL_CACHE_DIR="${WORK}/bun-cache" bun install --no-save --no-lockfile --ignore-scripts "${TARBALL}"

BIN_DIR="${WORK}/install/node_modules/.bin"
for bin in orchentra otr; do
  if [[ ! -x "${BIN_DIR}/${bin}" ]]; then
    echo "FAIL: ${bin} bin is missing or not executable" >&2
    exit 1
  fi

  version_out="$("${BIN_DIR}/${bin}" --version)"
  if [[ "${version_out}" != "orchentra ${PKG_VERSION}" ]]; then
    echo "FAIL: ${bin} --version printed '${version_out}', expected 'orchentra ${PKG_VERSION}'" >&2
    exit 1
  fi

  if [[ -z "$("${BIN_DIR}/${bin}" --help)" ]]; then
    echo "FAIL: ${bin} --help printed nothing" >&2
    exit 1
  fi

  echo ">> ${bin}: --version and --help ok"
done

echo ">> smoke test passed"

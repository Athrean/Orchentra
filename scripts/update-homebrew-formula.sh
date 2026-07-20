#!/usr/bin/env bash
#
# Update Formula/orchentra.rb for a real release: bump the version and replace
# each placeholder sha256 with the real hash from that tag's checksums.txt.
#
#   scripts/update-homebrew-formula.sh v0.9.0
#
# Each sha256 line is matched by its trailing "# <target>" comment, not by
# position, so the four hashes can never be swapped.

set -euo pipefail

TAG="${1:?usage: update-homebrew-formula.sh vX.Y.Z}"
VERSION="${TAG#v}"
REPO="Athrean/Orchentra"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORMULA="${ROOT}/Formula/orchentra.rb"

if [[ ! -f "${FORMULA}" ]]; then
  echo "error: formula not found at ${FORMULA}" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

echo ">> fetching checksums for ${TAG}"
curl -fsSL "https://github.com/${REPO}/releases/download/${TAG}/checksums.txt" -o "${tmp}/checksums.txt"

# Bump the version field. Write to a temp file and move back so this stays
# portable across BSD (macOS) and GNU sed, which disagree on `-i`.
sed "s/^  version \"[^\"]*\"/  version \"${VERSION}\"/" "${FORMULA}" > "${tmp}/formula.rb"

# Splice the real hash into the sha256 line tagged with each target.
for target in darwin-arm64 darwin-x64 linux-arm64 linux-x64; do
  hash="$(awk -v a="orchentra-${target}" '$2 == a || $2 == "*"a {print $1}' "${tmp}/checksums.txt" | head -n1)"
  if [[ -z "${hash}" ]]; then
    echo "error: no checksum for orchentra-${target} in ${TAG} checksums.txt" >&2
    exit 1
  fi
  sed "s|^\( *sha256 \"\)[0-9a-f]*\(\" # ${target}\)\$|\1${hash}\2|" "${tmp}/formula.rb" > "${tmp}/formula.next.rb"
  mv "${tmp}/formula.next.rb" "${tmp}/formula.rb"
done

mv "${tmp}/formula.rb" "${FORMULA}"
echo ">> updated ${FORMULA} to version ${VERSION}"

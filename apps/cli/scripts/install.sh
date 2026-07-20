#!/usr/bin/env bash
#
# Install the Orchentra CLI from the latest GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/Athrean/Orchentra/main/apps/cli/scripts/install.sh | bash
#
# Downloads the standalone binary for this OS/arch, verifies its SHA-256 against
# the release's checksums.txt, and installs it (plus an `otr` symlink) into
# ${ORCHENTRA_INSTALL_DIR:-$HOME/.local/bin}.

set -euo pipefail

REPO="Athrean/Orchentra"
BASE_URL="https://github.com/${REPO}/releases/latest/download"
INSTALL_DIR="${ORCHENTRA_INSTALL_DIR:-${HOME}/.local/bin}"

# --- detect os / arch (same triple shape as build-binaries.sh) ---
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "${os}" in
  darwin) os="darwin" ;;
  linux) os="linux" ;;
  *)
    echo "orchentra: unsupported OS '${os}' (only darwin / linux)" >&2
    exit 1
    ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch="arm64" ;;
  x86_64 | amd64) arch="x64" ;;
  *)
    echo "orchentra: unsupported arch '$(uname -m)'" >&2
    exit 1
    ;;
esac
asset="orchentra-${os}-${arch}"

# --- pick a checksum tool: macOS ships shasum, not GNU sha256sum ---
if command -v sha256sum >/dev/null 2>&1; then
  sha_of() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha_of() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  echo "orchentra: need sha256sum or shasum to verify the download" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

echo "orchentra: downloading ${asset}…"
curl -fsSL "${BASE_URL}/${asset}" -o "${tmp}/${asset}"
curl -fsSL "${BASE_URL}/checksums.txt" -o "${tmp}/checksums.txt"

# --- verify checksum (match the asset row; tolerate binary-mode '*' prefix) ---
expected="$(awk -v a="${asset}" '$2 == a || $2 == "*"a {print $1}' "${tmp}/checksums.txt" | head -n1)"
if [[ -z "${expected}" ]]; then
  echo "orchentra: no checksum for ${asset} in checksums.txt" >&2
  exit 1
fi
actual="$(sha_of "${tmp}/${asset}")"
if [[ "${expected}" != "${actual}" ]]; then
  echo "orchentra: checksum mismatch for ${asset}" >&2
  echo "  expected ${expected}" >&2
  echo "  actual   ${actual}" >&2
  exit 1
fi

# --- install + otr symlink ---
mkdir -p "${INSTALL_DIR}"
install -m 0755 "${tmp}/${asset}" "${INSTALL_DIR}/orchentra"
ln -sf orchentra "${INSTALL_DIR}/otr"

echo "orchentra: installed to ${INSTALL_DIR}/orchentra (with 'otr' symlink)"

case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *) echo "orchentra: note — ${INSTALL_DIR} is not on your PATH; add it to run 'orchentra'." >&2 ;;
esac

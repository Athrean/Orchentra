# `@orchentra/cli`

The terminal surface for Orchentra. Ships as TypeScript + Bun for local
development and as per-architecture single-file binaries for distribution.

## Run from source

```bash
bun run start                  # equivalent to: bun src/main.ts
bun src/main.ts --version
```

## Build single-file binaries

```bash
bun run build:binaries         # all four targets (darwin / linux × x64 / arm64)
bun run build:binaries:host    # only the host-platform binary
./scripts/build-binaries.sh darwin-arm64 linux-x64   # explicit subset
```

Outputs land in `apps/cli/dist/orchentra-<target>`. Targets supported:

| Target        | Bun `--target`     | Output                        |
| ------------- | ------------------ | ----------------------------- |
| macOS Apple   | `bun-darwin-arm64` | `dist/orchentra-darwin-arm64` |
| macOS Intel   | `bun-darwin-x64`   | `dist/orchentra-darwin-x64`   |
| Linux x86_64  | `bun-linux-x64`    | `dist/orchentra-linux-x64`    |
| Linux aarch64 | `bun-linux-arm64`  | `dist/orchentra-linux-arm64`  |

Binaries are gitignored (`dist/orchentra-*`). Cross-compilation downloads
the matching Bun runtime on first use; subsequent builds are cached.

### Cold-start (Apple Silicon, Bun 1.3.13, mean of 10 runs)

| Surface                         | `--version` wall-clock |
| ------------------------------- | ---------------------- |
| `bun src/main.ts`               | ~94 ms                 |
| `./dist/orchentra-darwin-arm64` | ~49 ms                 |

The compiled binary is ~2× faster on first invocation because there's no
Bun runtime resolution, no `node_modules` traversal, and no TS transpile.

## Sanity test

`apps/cli/tests/build-binaries.test.ts` spawns the host-platform binary
and asserts `--version` exits 0 with the expected output. The test is
**skipped** when `dist/orchentra-<host>` is absent, so `bun test` still
passes in environments that haven't run the build step.

```bash
bun run build:binaries:host
bun test apps/cli/tests/build-binaries.test.ts
```

## Install (binary distribution)

Once a binary exists on a target machine, the install pattern mirrors
the standard `curl | sh` shape used by other terminal tools:

```bash
# Fetch the right binary for the host arch, chmod +x, drop on PATH.
curl -L https://<release-url>/orchentra-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/') \
  -o /usr/local/bin/orchentra
chmod +x /usr/local/bin/orchentra
orchentra --version
```

The matching `install.sh` and release-publishing workflow are not part of
this package — they will land alongside the first tagged release.

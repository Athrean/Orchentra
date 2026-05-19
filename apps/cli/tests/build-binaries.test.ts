import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { CLI_VERSION } from '../src/version'

/**
 * Host-platform binary smoke test.
 *
 * Skipped when the compiled binary is not present (so plain `bun test`
 * keeps passing in environments that haven't run the build). Run
 * `bun run build:binaries` (or `build:binaries:host`) first to populate
 * `dist/orchentra-<target>`.
 */

function hostTriple(): string {
  const platform = process.platform // 'darwin' | 'linux' | ...
  const arch = process.arch // 'x64' | 'arm64' | ...
  const archName = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : arch
  return `${platform}-${archName}`
}

const BINARY_PATH = resolve(import.meta.dir, '..', 'dist', `orchentra-${hostTriple()}`)
const BINARY_AVAILABLE = existsSync(BINARY_PATH)

const describeIfBinary = BINARY_AVAILABLE ? describe : describe.skip

describeIfBinary(`compiled binary (${hostTriple()})`, () => {
  test('--version exits 0 and prints "orchentra <semver>"', async () => {
    const proc = Bun.spawn({
      cmd: [BINARY_PATH, '--version'],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    const exitCode = await proc.exited
    expect(stderr).toBe('')
    expect(exitCode).toBe(0)
    expect(stdout.trim()).toBe(`orchentra ${CLI_VERSION}`)
    // Format guard: orchentra followed by a semver-shaped string.
    expect(stdout.trim()).toMatch(/^orchentra \d+\.\d+\.\d+/)
  })
})

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Static verification for the curl-install + Homebrew distribution artifacts.
 * These never cut a real release — they prove the mechanism is syntactically
 * valid and shaped correctly (asset naming, checksum verification, the
 * updater's sha256-splice regex) so a real tag push would work.
 */

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..')
const INSTALL_SH = resolve(REPO_ROOT, 'apps/cli/scripts/install.sh')
const UPDATE_SH = resolve(REPO_ROOT, 'scripts/update-homebrew-formula.sh')
const FORMULA = resolve(REPO_ROOT, 'Formula/orchentra.rb')
const WORKFLOW = resolve(REPO_ROOT, '.github/workflows/release-binaries.yml')

const TARGETS = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64']

async function run(cmd: string[]): Promise<{ code: number; stderr: string }> {
  const proc = Bun.spawn({ cmd, stdout: 'pipe', stderr: 'pipe' })
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  return { code, stderr }
}

async function have(bin: string): Promise<boolean> {
  return (await run(['sh', '-c', `command -v ${bin}`])).code === 0
}

describe('shell scripts parse', () => {
  test('install.sh is valid bash', async () => {
    const { code, stderr } = await run(['bash', '-n', INSTALL_SH])
    expect(stderr).toBe('')
    expect(code).toBe(0)
  })

  test('update-homebrew-formula.sh is valid bash', async () => {
    const { code, stderr } = await run(['bash', '-n', UPDATE_SH])
    expect(stderr).toBe('')
    expect(code).toBe(0)
  })
})

describe('Homebrew formula', () => {
  test('is valid Ruby (skipped when ruby is absent)', async () => {
    if (!(await have('ruby'))) return
    const { code, stderr } = await run(['ruby', '-c', FORMULA])
    expect(stderr).toBe('')
    expect(code).toBe(0)
  })

  test('carries one target-tagged placeholder sha256 per target', () => {
    const src = readFileSync(FORMULA, 'utf8')
    for (const target of TARGETS) {
      expect(src).toContain(`orchentra-${target}`)
      // A 64-hex placeholder line tagged with the target the updater matches on.
      expect(src).toMatch(new RegExp(`sha256 "[0-9a-f]{64}" # ${target}`))
    }
    expect(src).toContain('bin.install_symlink "orchentra" => "otr"')
  })
})

describe("updater's sha256 splice regex matches the real formula", () => {
  // The load-bearing part of update-homebrew-formula.sh is the per-target sed
  // that swaps the placeholder hash. Prove it against the actual formula, with a
  // dummy hash, so a drift between the formula's line shape and the sed breaks
  // here rather than silently no-op'ing during a release.
  const dummy = 'a'.repeat(64)
  for (const target of TARGETS) {
    test(`splices the ${target} hash`, async () => {
      const sed = `s|^\\( *sha256 "\\)[0-9a-f]*\\(" # ${target}\\)$|\\1${dummy}\\2|`
      const proc = Bun.spawn({ cmd: ['sed', sed, FORMULA], stdout: 'pipe', stderr: 'pipe' })
      const out = await new Response(proc.stdout).text()
      expect(await proc.exited).toBe(0)
      expect(out).toContain(`sha256 "${dummy}" # ${target}`)
    })
  }
})

describe('release workflow', () => {
  test('parses as YAML (skipped when python3+pyyaml absent)', async () => {
    if (!(await have('python3'))) return
    const check = await run(['python3', '-c', 'import yaml'])
    if (check.code !== 0) return
    const { code, stderr } = await run([
      'python3',
      '-c',
      `import yaml,sys; yaml.safe_load(open(sys.argv[1]))`,
      WORKFLOW,
    ])
    expect(stderr).toBe('')
    expect(code).toBe(0)
  })

  test('triggers on version tags with contents:write and builds all four assets', () => {
    const src = readFileSync(WORKFLOW, 'utf8')
    expect(src).toMatch(/tags:\s*\n\s*-\s*'v\*'/)
    expect(src).toContain('contents: write')
    expect(src).toContain('./scripts/build-binaries.sh')
    expect(src).toContain('sha256sum orchentra-* > checksums.txt')
    for (const target of TARGETS) expect(src).toContain(`orchentra-${target}`)
    // Re-runnable on the same tag: view-then-upload-with-clobber, else create.
    expect(src).toContain('--clobber')
    expect(src).toContain('gh release view')
  })
})

describe('install script contract', () => {
  test('resolves per-OS/arch assets and verifies the checksum before installing', () => {
    const src = readFileSync(INSTALL_SH, 'utf8')
    expect(src).toContain('orchentra-${os}-${arch}')
    expect(src).toContain('releases/latest/download')
    // macOS has shasum, not sha256sum — both paths must exist.
    expect(src).toContain('sha256sum')
    expect(src).toContain('shasum -a 256')
    expect(src).toContain('checksum mismatch')
    expect(src).toContain('ORCHENTRA_INSTALL_DIR')
    expect(src).toContain('ln -sf orchentra')
  })
})

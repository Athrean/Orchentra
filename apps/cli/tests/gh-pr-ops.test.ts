import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShellGhPrOps, GhPrError } from '../src/commands/gh-pr-ops'

/**
 * Install a fake `gh` binary in a tempdir and prepend it to PATH so the
 * production code path that resolves the gh binary picks ours. This exercises
 * the real spawn pipeline without hitting GitHub.
 */
function installFakeGh(args: { listJson: string; createUrl: string; viewUrl: string }): {
  bin: string
  log: string
} {
  const home = mkdtempSync(join(tmpdir(), 'gh-fake-'))
  mkdirSync(home, { recursive: true })
  const logPath = join(home, 'log.txt')
  const script = `#!/usr/bin/env sh
echo "$@" >> "${logPath}"
case "$1 $2" in
  "pr list")
    cat <<'JSON'
${args.listJson}
JSON
    ;;
  "pr create")
    echo "${args.createUrl}"
    ;;
  "pr edit")
    exit 0
    ;;
  "pr view")
    echo "${args.viewUrl}"
    ;;
  *)
    echo "unexpected: $@" 1>&2
    exit 99
    ;;
esac
`
  const bin = join(home, 'gh')
  writeFileSync(bin, script)
  chmodSync(bin, 0o755)
  return { bin, log: logPath }
}

describe('ShellGhPrOps', () => {
  test('create invokes `gh pr create` with the right flags and returns parsed PR number', async () => {
    const fake = installFakeGh({
      listJson: '[]',
      createUrl: 'https://github.com/o/r/pull/123',
      viewUrl: 'https://github.com/o/r/pull/123',
    })
    const gh = new ShellGhPrOps({ ghBinary: fake.bin })

    const result = await gh.create({
      owner: 'o',
      repo: 'r',
      head: 'orchentra/fix/run-42',
      base: 'main',
      title: 'fix(ci): t',
      body: 'body',
    })

    expect(result.number).toBe(123)
    expect(result.url).toBe('https://github.com/o/r/pull/123')
  })

  test('findOpenByHead returns null when gh pr list emits []', async () => {
    const fake = installFakeGh({
      listJson: '[]',
      createUrl: '',
      viewUrl: '',
    })
    const gh = new ShellGhPrOps({ ghBinary: fake.bin })
    const result = await gh.findOpenByHead('o', 'r', 'orchentra/fix/run-42')
    expect(result).toBeNull()
  })

  test('findOpenByHead returns the row when gh pr list emits one entry', async () => {
    const fake = installFakeGh({
      listJson: '[{"number":55,"url":"https://github.com/o/r/pull/55","state":"OPEN"}]',
      createUrl: '',
      viewUrl: '',
    })
    const gh = new ShellGhPrOps({ ghBinary: fake.bin })
    const result = await gh.findOpenByHead('o', 'r', 'orchentra/fix/run-42')
    expect(result?.number).toBe(55)
    expect(result?.url).toBe('https://github.com/o/r/pull/55')
  })

  test('update returns the PR URL via gh pr view', async () => {
    const fake = installFakeGh({
      listJson: '[]',
      createUrl: '',
      viewUrl: 'https://github.com/o/r/pull/55',
    })
    const gh = new ShellGhPrOps({ ghBinary: fake.bin })
    const result = await gh.update({ owner: 'o', repo: 'r', number: 55, title: 'fix(ci): t', body: 'b' })
    expect(result.number).toBe(55)
    expect(result.url).toBe('https://github.com/o/r/pull/55')
  })

  test('create throws GhPrError when gh exits non-zero', async () => {
    const home = mkdtempSync(join(tmpdir(), 'gh-fake-'))
    const bin = join(home, 'gh')
    writeFileSync(bin, '#!/usr/bin/env sh\necho "boom" 1>&2\nexit 7\n')
    chmodSync(bin, 0o755)
    const gh = new ShellGhPrOps({ ghBinary: bin })

    let caught: unknown = null
    try {
      await gh.create({ owner: 'o', repo: 'r', head: 'h', base: 'main', title: 't', body: 'b' })
    } catch (err) {
      caught = err
    }
    expect(caught instanceof GhPrError).toBe(true)
    if (caught instanceof GhPrError) {
      expect(caught.exitCode).toBe(7)
      expect(caught.stderr).toContain('boom')
    }
  })
})

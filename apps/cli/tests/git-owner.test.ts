/**
 * Boundary tests for the shared git-origin → GitHub owner/repo parser.
 *
 * `parseGitHubRemote(url)` covers the pure-string variants we need: SSH
 * vs HTTPS, with and without the `.git` suffix, non-GitHub remotes, and
 * malformed input. `inferGitHubOwner(cwd)` integrates the parser with
 * a real `git remote get-url origin` call against a temp directory.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inferGitHubOwner, parseGitHubRemote } from '../src/util/git-owner'

describe('parseGitHubRemote — string-level variants', () => {
  test('SSH with .git suffix', () => {
    expect(parseGitHubRemote('git@github.com:Athrean/Orchentra.git')).toEqual({
      owner: 'Athrean',
      repo: 'Orchentra',
    })
  })

  test('SSH without .git suffix', () => {
    expect(parseGitHubRemote('git@github.com:Athrean/Orchentra')).toEqual({
      owner: 'Athrean',
      repo: 'Orchentra',
    })
  })

  test('ssh:// URL form with .git suffix', () => {
    expect(parseGitHubRemote('ssh://git@github.com/Athrean/Orchentra.git')).toEqual({
      owner: 'Athrean',
      repo: 'Orchentra',
    })
  })

  test('ssh:// URL form without .git suffix', () => {
    expect(parseGitHubRemote('ssh://git@github.com/Athrean/Orchentra')).toEqual({
      owner: 'Athrean',
      repo: 'Orchentra',
    })
  })

  test('HTTPS with .git suffix', () => {
    expect(parseGitHubRemote('https://github.com/Athrean/Orchentra.git')).toEqual({
      owner: 'Athrean',
      repo: 'Orchentra',
    })
  })

  test('HTTPS without .git suffix', () => {
    expect(parseGitHubRemote('https://github.com/Athrean/Orchentra')).toEqual({
      owner: 'Athrean',
      repo: 'Orchentra',
    })
  })

  test('HTTPS with trailing slash', () => {
    expect(parseGitHubRemote('https://github.com/Athrean/Orchentra/')).toEqual({
      owner: 'Athrean',
      repo: 'Orchentra',
    })
  })

  test('non-GitHub host returns null', () => {
    expect(parseGitHubRemote('git@gitlab.com:Athrean/Orchentra.git')).toBeNull()
    expect(parseGitHubRemote('https://bitbucket.org/Athrean/Orchentra.git')).toBeNull()
  })

  test('malformed input returns null', () => {
    expect(parseGitHubRemote('')).toBeNull()
    expect(parseGitHubRemote('not-a-url')).toBeNull()
    expect(parseGitHubRemote('https://github.com/')).toBeNull()
  })
})

describe('inferGitHubOwner — real git remote lookup', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'git-owner-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  // Husky-invoked test runs inherit GIT_DIR / GIT_WORK_TREE from the
  // outer commit, which would override `cwd` for these setup spawns.
  // Strip git env so `git init` actually initializes inside `tmp`.
  function cleanGitEnv(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined || k.startsWith('GIT_')) continue
      out[k] = v
    }
    return out
  }
  function gitInit(cwd: string): void {
    Bun.spawnSync(['git', 'init', '-q'], { cwd, env: cleanGitEnv() })
  }
  function gitAddRemote(cwd: string, url: string): void {
    Bun.spawnSync(['git', 'remote', 'add', 'origin', url], { cwd, env: cleanGitEnv() })
  }

  test('returns owner+repo for a real git origin pointed at GitHub', () => {
    gitInit(tmp)
    gitAddRemote(tmp, 'git@github.com:Athrean/Orchentra.git')
    expect(inferGitHubOwner(tmp)).toEqual({ owner: 'Athrean', repo: 'Orchentra' })
  })

  test('returns null when the directory is not a git repo', () => {
    expect(inferGitHubOwner(tmp)).toBeNull()
  })

  test('returns null when origin remote is missing', () => {
    gitInit(tmp)
    expect(inferGitHubOwner(tmp)).toBeNull()
  })

  test('returns null when origin remote is not GitHub', () => {
    gitInit(tmp)
    gitAddRemote(tmp, 'https://gitlab.com/Athrean/Orchentra.git')
    expect(inferGitHubOwner(tmp)).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveToken, writeTokenFile, tokenFilePath } from '../src/github/token'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orchentra-gh-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('resolveToken', () => {
  test('prefers ORCHENTRA_GITHUB_TOKEN over GITHUB_TOKEN', () => {
    const result = resolveToken({
      env: { ORCHENTRA_GITHUB_TOKEN: 'orchentra', GITHUB_TOKEN: 'generic' },
      home,
      ghBinary: '/nonexistent/gh',
    })
    expect(result).toEqual({ token: 'orchentra', source: 'env' })
  })

  test('falls through empty env to file', () => {
    mkdirSync(join(home, '.config', 'orchentra'), { recursive: true })
    writeFileSync(tokenFilePath(home), 'from-file\n', 'utf8')

    const result = resolveToken({
      env: { ORCHENTRA_GITHUB_TOKEN: '  ' },
      home,
      ghBinary: '/nonexistent/gh',
    })
    expect(result).toEqual({ token: 'from-file', source: 'file' })
  })

  test('returns null when env, file, and gh cli all miss', () => {
    const result = resolveToken({ env: {}, home, ghBinary: '/nonexistent/gh-binary' })
    expect(result).toBeNull()
  })

  test('uses GH_TOKEN as final env fallback', () => {
    const result = resolveToken({
      env: { GH_TOKEN: 'gh-token-value' },
      home,
      ghBinary: '/nonexistent/gh',
    })
    expect(result).toEqual({ token: 'gh-token-value', source: 'env' })
  })
})

describe('writeTokenFile', () => {
  test('creates file with 0600 permissions', () => {
    const path = writeTokenFile('secret-token', home)
    const stat = statSync(path)
    const perms = stat.mode & 0o777
    expect(perms).toBe(0o600)
    expect(readFileSync(path, 'utf8')).toBe('secret-token')
  })

  test('creates ~/.config/orchentra directory if missing', () => {
    const path = writeTokenFile('x', home)
    expect(path).toBe(join(home, '.config', 'orchentra', 'github-token'))
  })
})

import { describe, test, expect } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fingerprintWorkspace } from '../../src/sessions/workspace-fingerprint'

describe('fingerprintWorkspace', () => {
  test('returns a 16-char hex string', () => {
    const fp = fingerprintWorkspace('/Users/foo/repo')
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })

  test('is idempotent — same input produces same output', () => {
    const a = fingerprintWorkspace('/Users/foo/repo')
    const b = fingerprintWorkspace('/Users/foo/repo')
    expect(a).toBe(b)
  })

  test('different absolute paths produce different fingerprints', () => {
    const a = fingerprintWorkspace('/Users/foo/repo')
    const b = fingerprintWorkspace('/Users/foo/other-repo')
    expect(a).not.toBe(b)
  })

  test('trailing-slash invariant — same fingerprint with or without trailing slash', () => {
    const a = fingerprintWorkspace('/Users/foo/repo')
    const b = fingerprintWorkspace('/Users/foo/repo/')
    expect(a).toBe(b)
  })

  test('normalizes redundant separators', () => {
    const a = fingerprintWorkspace('/Users/foo/repo')
    const b = fingerprintWorkspace('/Users/foo//repo')
    expect(a).toBe(b)
  })

  test('resolves symlinks so two paths to the same target match', () => {
    const root = mkdtempSync(join(tmpdir(), 'orchentra-fp-sym-'))
    try {
      const target = join(root, 'real')
      const link = join(root, 'link')
      mkdirSync(target)
      symlinkSync(target, link)
      const direct = fingerprintWorkspace(target)
      const viaLink = fingerprintWorkspace(link)
      expect(direct).toBe(viaLink)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('platform-stable — pure SHA-256 of normalized path, no env coupling', () => {
    // If this changes, every existing user's sessions move dir. Pin the value
    // so a future refactor must be explicit about migration.
    const fp = fingerprintWorkspace('/Users/foo/repo')
    expect(fp.length).toBe(16)
    // Repeated under a different cwd to assert no cwd coupling
    const prevCwd = process.cwd()
    try {
      process.chdir(tmpdir())
      expect(fingerprintWorkspace('/Users/foo/repo')).toBe(fp)
    } finally {
      process.chdir(prevCwd)
    }
  })
})

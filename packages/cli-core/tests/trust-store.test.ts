import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTrustStore, defaultTrustStorePath } from '../src/trust/store'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trust-store-'))
  file = join(dir, 'trusted-dirs')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('createTrustStore', () => {
  test('missing file → status unknown for any path', () => {
    const s = createTrustStore({ filePath: file })
    expect(s.status('/some/path')).toBe('unknown')
    expect(s.list().trusted).toEqual([])
    expect(s.list().denied).toEqual([])
  })

  test('trust(path) persists, reload sees trusted', () => {
    const s = createTrustStore({ filePath: file })
    s.trust('/repo/a')
    expect(s.status('/repo/a')).toBe('trusted')
    const s2 = createTrustStore({ filePath: file })
    expect(s2.status('/repo/a')).toBe('trusted')
  })

  test('deny(path) persists, reload sees denied', () => {
    const s = createTrustStore({ filePath: file })
    s.deny('/tmp/sus')
    expect(s.status('/tmp/sus')).toBe('denied')
    const s2 = createTrustStore({ filePath: file })
    expect(s2.status('/tmp/sus')).toBe('denied')
  })

  test('deny overrides trust for the same path', () => {
    const s = createTrustStore({ filePath: file })
    s.trust('/repo/a')
    s.deny('/repo/a')
    expect(s.status('/repo/a')).toBe('denied')
  })

  test('trust → deny → trust ends as trusted', () => {
    const s = createTrustStore({ filePath: file })
    s.trust('/repo/a')
    s.deny('/repo/a')
    s.trust('/repo/a')
    expect(s.status('/repo/a')).toBe('trusted')
  })

  test('persisted JSON shape matches schema {version, trusted, denied}', () => {
    const s = createTrustStore({ filePath: file })
    s.trust('/repo/a')
    s.deny('/tmp/sus')
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    expect(parsed.version).toBe(1)
    expect(parsed.trusted).toEqual(['/repo/a'])
    expect(parsed.denied).toEqual(['/tmp/sus'])
  })

  test('duplicate trust does not double-add', () => {
    const s = createTrustStore({ filePath: file })
    s.trust('/repo/a')
    s.trust('/repo/a')
    expect(s.list().trusted).toEqual(['/repo/a'])
  })

  test('malformed JSON → empty store + warn', () => {
    writeFileSync(file, '{not json', 'utf8')
    const warns: string[] = []
    const s = createTrustStore({ filePath: file, onWarn: (m) => warns.push(m) })
    expect(s.status('/repo/a')).toBe('unknown')
    expect(warns.length).toBe(1)
    expect(warns[0]).toContain('malformed')
  })

  test('schema version mismatch → empty store + warn', () => {
    writeFileSync(file, JSON.stringify({ version: 99, trusted: [], denied: [] }), 'utf8')
    const warns: string[] = []
    const s = createTrustStore({ filePath: file, onWarn: (m) => warns.push(m) })
    expect(s.status('/repo/a')).toBe('unknown')
    expect(warns[0]).toContain('schema')
  })

  test('defaultTrustStorePath honors ORCHENTRA_CONFIG_HOME', () => {
    expect(defaultTrustStorePath({ ORCHENTRA_CONFIG_HOME: '/tmp/x', HOME: '/h' })).toBe('/tmp/x/trusted-dirs')
  })

  test('defaultTrustStorePath defaults to ~/.config/orchentra/trusted-dirs', () => {
    expect(defaultTrustStorePath({ HOME: '/h' })).toBe('/h/.config/orchentra/trusted-dirs')
  })

  test('non-string entries in arrays are filtered out', () => {
    writeFileSync(
      file,
      JSON.stringify({ version: 1, trusted: ['/repo/a', 42, null], denied: [{ x: 1 }, '/tmp/sus'] }),
      'utf8',
    )
    const s = createTrustStore({ filePath: file })
    expect(s.list().trusted).toEqual(['/repo/a'])
    expect(s.list().denied).toEqual(['/tmp/sus'])
  })
})

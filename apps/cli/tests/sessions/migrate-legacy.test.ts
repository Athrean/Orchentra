import { describe, test, expect } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateLegacySessions, LEGACY_FINGERPRINT } from '../../src/sessions/migrate-legacy'

describe('migrateLegacySessions', () => {
  test('moves flat-dir JSONL files into a `legacy/` subdir on first call', () => {
    const home = mkdtempSync(join(tmpdir(), 'orchentra-mig-'))
    try {
      const sessions = join(home, '.orchentra', 'sessions')
      mkdirSync(sessions, { recursive: true })
      writeFileSync(join(sessions, 'aaa.jsonl'), '{"event":"x"}\n')
      writeFileSync(join(sessions, 'bbb.jsonl'), '{"event":"y"}\n')

      const result = migrateLegacySessions(home)
      expect(result.moved).toBe(2)

      const legacyDir = join(sessions, LEGACY_FINGERPRINT)
      expect(existsSync(join(legacyDir, 'aaa.jsonl'))).toBe(true)
      expect(existsSync(join(legacyDir, 'bbb.jsonl'))).toBe(true)
      expect(readFileSync(join(legacyDir, 'aaa.jsonl'), 'utf8')).toBe('{"event":"x"}\n')

      // Original flat-dir files removed
      expect(existsSync(join(sessions, 'aaa.jsonl'))).toBe(false)
      expect(existsSync(join(sessions, 'bbb.jsonl'))).toBe(false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('is idempotent — second call is a no-op', () => {
    const home = mkdtempSync(join(tmpdir(), 'orchentra-mig-'))
    try {
      const sessions = join(home, '.orchentra', 'sessions')
      mkdirSync(sessions, { recursive: true })
      writeFileSync(join(sessions, 'x.jsonl'), '{}\n')

      const first = migrateLegacySessions(home)
      expect(first.moved).toBe(1)

      const second = migrateLegacySessions(home)
      expect(second.moved).toBe(0)

      // Files still present in legacy/
      expect(existsSync(join(sessions, LEGACY_FINGERPRINT, 'x.jsonl'))).toBe(true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('no-op when the sessions root does not exist', () => {
    const home = mkdtempSync(join(tmpdir(), 'orchentra-mig-'))
    try {
      const result = migrateLegacySessions(home)
      expect(result.moved).toBe(0)
      expect(existsSync(join(home, '.orchentra', 'sessions'))).toBe(false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('no-op when the sessions root has only fingerprint subdirs already', () => {
    const home = mkdtempSync(join(tmpdir(), 'orchentra-mig-'))
    try {
      const sessions = join(home, '.orchentra', 'sessions')
      const bucket = join(sessions, 'abcdef0123456789')
      mkdirSync(bucket, { recursive: true })
      writeFileSync(join(bucket, 's.jsonl'), '{}\n')

      const result = migrateLegacySessions(home)
      expect(result.moved).toBe(0)
      expect(existsSync(join(bucket, 's.jsonl'))).toBe(true)
      expect(existsSync(join(sessions, LEGACY_FINGERPRINT))).toBe(false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('ignores non-JSONL entries and subdirectories', () => {
    const home = mkdtempSync(join(tmpdir(), 'orchentra-mig-'))
    try {
      const sessions = join(home, '.orchentra', 'sessions')
      mkdirSync(sessions, { recursive: true })
      writeFileSync(join(sessions, 'a.jsonl'), '{}\n')
      writeFileSync(join(sessions, 'README.txt'), 'hi\n')
      mkdirSync(join(sessions, 'some-bucket'))

      const result = migrateLegacySessions(home)
      expect(result.moved).toBe(1)
      expect(existsSync(join(sessions, 'README.txt'))).toBe(true)
      expect(existsSync(join(sessions, 'some-bucket'))).toBe(true)
      // Sanity: only the jsonl moved
      const legacyContents = readdirSync(join(sessions, LEGACY_FINGERPRINT))
      expect(legacyContents.sort()).toEqual(['a.jsonl'])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

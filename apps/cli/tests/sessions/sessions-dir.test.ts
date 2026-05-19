import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fingerprintWorkspace } from '../../src/sessions/workspace-fingerprint'
import { getSessionsRootDir, getSessionsDirForWorkspace, LEGACY_FINGERPRINT } from '../../src/session-config'

let savedHome: string | undefined
let tmpHome: string

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'orchentra-sessions-dir-'))
  savedHome = process.env['ORCHENTRA_HOME']
  process.env['ORCHENTRA_HOME'] = tmpHome
})

afterEach(() => {
  if (savedHome === undefined) delete process.env['ORCHENTRA_HOME']
  else process.env['ORCHENTRA_HOME'] = savedHome
  rmSync(tmpHome, { recursive: true, force: true })
})

describe('getSessionsRootDir', () => {
  test('respects ORCHENTRA_HOME override', () => {
    expect(getSessionsRootDir()).toBe(join(tmpHome, '.orchentra', 'sessions'))
  })
})

describe('getSessionsDirForWorkspace', () => {
  test('returns a fingerprinted subdirectory under the sessions root', () => {
    const workspace = '/Users/foo/repo-x'
    const dir = getSessionsDirForWorkspace(workspace)
    const fp = fingerprintWorkspace(workspace)
    expect(dir).toBe(join(tmpHome, '.orchentra', 'sessions', fp))
  })

  test('different workspaces map to different bucket dirs', () => {
    const a = getSessionsDirForWorkspace('/Users/foo/repo-a')
    const b = getSessionsDirForWorkspace('/Users/foo/repo-b')
    expect(a).not.toBe(b)
  })

  test('opportunistically migrates legacy flat-dir sessions on first call', () => {
    const sessionsRoot = join(tmpHome, '.orchentra', 'sessions')
    mkdirSync(sessionsRoot, { recursive: true })
    writeFileSync(join(sessionsRoot, 'legacy-a.jsonl'), '{}\n')

    // Touching the helper at least once should drain the flat dir.
    getSessionsDirForWorkspace('/Users/foo/repo')

    expect(existsSync(join(sessionsRoot, 'legacy-a.jsonl'))).toBe(false)
    expect(existsSync(join(sessionsRoot, LEGACY_FINGERPRINT, 'legacy-a.jsonl'))).toBe(true)
  })

  test('returned path can be created on disk and is reachable', () => {
    const dir = getSessionsDirForWorkspace('/Users/foo/repo')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 's.jsonl'), '{}\n')
    expect(existsSync(join(dir, 's.jsonl'))).toBe(true)
  })
})

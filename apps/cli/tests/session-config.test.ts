import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getActiveRepo,
  setActiveRepo,
  clearActiveRepo,
  getActiveTerseMode,
  setActiveTerseMode,
  sessionConfigPath,
} from '../src/session-config'

let tempDir: string
let savedEnv: string | undefined

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'orchentra-session-config-'))
  savedEnv = process.env.ORCHENTRA_CONFIG_HOME
  process.env.ORCHENTRA_CONFIG_HOME = tempDir
})

afterEach(() => {
  if (savedEnv === undefined) delete process.env.ORCHENTRA_CONFIG_HOME
  else process.env.ORCHENTRA_CONFIG_HOME = savedEnv
  rmSync(tempDir, { recursive: true, force: true })
})

describe('session-config: activeRepo', () => {
  test('returns null when no session file exists', () => {
    expect(getActiveRepo()).toBeNull()
  })

  test('returns null when file exists but field is absent', () => {
    mkdirSync(tempDir, { recursive: true })
    writeFileSync(sessionConfigPath(), JSON.stringify({ version: 1 }))
    expect(getActiveRepo()).toBeNull()
  })

  test('round-trips a value through set + get', () => {
    setActiveRepo('acme/api')
    expect(getActiveRepo()).toBe('acme/api')
  })

  test('persists across reads via the file on disk', () => {
    setActiveRepo('acme/web')
    const raw = readFileSync(sessionConfigPath(), 'utf8')
    const parsed = JSON.parse(raw) as { activeRepo?: string }
    expect(parsed.activeRepo).toBe('acme/web')
  })

  test('overwrites prior value', () => {
    setActiveRepo('first/one')
    setActiveRepo('second/two')
    expect(getActiveRepo()).toBe('second/two')
  })

  test('clearActiveRepo wipes the field but keeps the file readable', () => {
    setActiveRepo('acme/api')
    clearActiveRepo()
    expect(getActiveRepo()).toBeNull()
    expect(existsSync(sessionConfigPath())).toBe(true)
  })

  test('writes the session file with 0600 mode', () => {
    setActiveRepo('acme/api')
    const mode = statSync(sessionConfigPath()).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test('survives a corrupted on-disk JSON payload by treating it as empty', () => {
    mkdirSync(tempDir, { recursive: true })
    writeFileSync(sessionConfigPath(), 'not json {')
    expect(getActiveRepo()).toBeNull()
    setActiveRepo('acme/api')
    expect(getActiveRepo()).toBe('acme/api')
  })

  test('round-trips active terse mode and preserves other session keys', () => {
    setActiveRepo('acme/api')
    setActiveTerseMode('full')

    expect(getActiveRepo()).toBe('acme/api')
    expect(getActiveTerseMode()).toBe('full')

    const raw = JSON.parse(readFileSync(sessionConfigPath(), 'utf8')) as {
      activeRepo?: string
      activeTerseMode?: string
    }
    expect(raw.activeRepo).toBe('acme/api')
    expect(raw.activeTerseMode).toBe('full')
  })
})

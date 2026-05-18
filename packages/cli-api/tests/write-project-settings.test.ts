import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeProjectSettings } from '../src/orchentra/write-project-settings'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'orchentra-write-settings-'))
})

afterEach(() => {
  if (cwd && existsSync(cwd)) rmSync(cwd, { recursive: true, force: true })
})

describe('writeProjectSettings', () => {
  test('creates .orchentra/settings.json with the given orgId', () => {
    const path = writeProjectSettings({ cwd, orgId: 'Athrean' })
    expect(path).toBe(join(cwd, '.orchentra', 'settings.json'))
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    expect(parsed.orgId).toBe('Athrean')
  })

  test('persists serverUrl when provided', () => {
    const path = writeProjectSettings({ cwd, orgId: 'Athrean', serverUrl: 'https://api.example.com' })
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    expect(parsed.serverUrl).toBe('https://api.example.com')
  })

  test('preserves unrelated keys in an existing settings.json', () => {
    const dir = join(cwd, '.orchentra')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ existingKey: 'keep-me', orgId: 'old' }))
    writeProjectSettings({ cwd, orgId: 'new-org' })
    const parsed = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
    expect(parsed.existingKey).toBe('keep-me')
    expect(parsed.orgId).toBe('new-org')
  })

  test('writes via tmp+rename so a partial write cannot corrupt the file', () => {
    writeProjectSettings({ cwd, orgId: 'Athrean' })
    const dirEntries = readdirSync(join(cwd, '.orchentra'))
    expect(dirEntries).toContain('settings.json')
    expect(dirEntries.filter((f) => f.startsWith('settings.json.'))).toEqual([])
  })
})

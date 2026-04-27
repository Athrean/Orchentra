import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveOrchentraConfig, MissingOrchentraConfigError } from '../src/orchentra/config'
import { saveCredential } from '../src/credential-store'

let tmp: string
let cwd: string
let home: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orchentra-cfg-'))
  cwd = join(tmp, 'project')
  home = join(tmp, 'home')
  mkdirSync(cwd, { recursive: true })
  mkdirSync(home, { recursive: true })
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('resolveOrchentraConfig', () => {
  test('reads all values from environment variables', () => {
    const cfg = resolveOrchentraConfig({
      cwd,
      home,
      env: {
        ORCHENTRA_SERVER_URL: 'http://localhost:9999',
        ORCHENTRA_ORG_ID: 'org-env',
        ORCHENTRA_API_KEY: 'orch_env',
      },
    })
    expect(cfg.serverUrl).toBe('http://localhost:9999')
    expect(cfg.orgId).toBe('org-env')
    expect(cfg.apiKey).toBe('orch_env')
  })

  test('falls back to .orchentra/settings.json for serverUrl and orgId', () => {
    mkdirSync(join(cwd, '.orchentra'), { recursive: true })
    writeFileSync(
      join(cwd, '.orchentra', 'settings.json'),
      JSON.stringify({ serverUrl: 'http://settings:1234', orgId: 'org-file' }),
    )
    saveCredential('orchentra' as never, { apiKey: 'orch_stored' }, home)

    const cfg = resolveOrchentraConfig({ cwd, home, env: {} })
    expect(cfg.serverUrl).toBe('http://settings:1234')
    expect(cfg.orgId).toBe('org-file')
    expect(cfg.apiKey).toBe('orch_stored')
  })

  test('env wins over settings file', () => {
    mkdirSync(join(cwd, '.orchentra'), { recursive: true })
    writeFileSync(
      join(cwd, '.orchentra', 'settings.json'),
      JSON.stringify({ serverUrl: 'http://settings:1', orgId: 'org-file' }),
    )
    saveCredential('orchentra' as never, { apiKey: 'orch_stored' }, home)

    const cfg = resolveOrchentraConfig({
      cwd,
      home,
      env: { ORCHENTRA_ORG_ID: 'org-env' },
    })
    expect(cfg.orgId).toBe('org-env')
    expect(cfg.serverUrl).toBe('http://settings:1')
  })

  test('defaults serverUrl to http://localhost:3001 when nothing else set', () => {
    saveCredential('orchentra' as never, { apiKey: 'k' }, home)
    const cfg = resolveOrchentraConfig({
      cwd,
      home,
      env: { ORCHENTRA_ORG_ID: 'o' },
    })
    expect(cfg.serverUrl).toBe('http://localhost:3001')
  })

  test('throws MissingOrchentraConfigError listing every missing field', () => {
    let err: unknown
    try {
      resolveOrchentraConfig({ cwd, home, env: {} })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(MissingOrchentraConfigError)
    const message = (err as Error).message
    expect(message).toContain('orgId')
    expect(message).toContain('apiKey')
  })
})

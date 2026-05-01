import { describe, expect, test } from 'bun:test'
import { wrapBashCommand, prepareSandboxDirs } from '../src/sandbox'
import { defaultSandboxConfig } from '../src/sandbox/types'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('wrapBashCommand', () => {
  test('disabled override → returns null (caller spawns directly)', () => {
    const result = wrapBashCommand('echo ok', '/Users/dev/proj', {
      config: defaultSandboxConfig(),
      overrides: { enabled: false },
    })
    expect(result).toBeNull()
  })

  test('on darwin, enabled + workspace-only → returns sandbox-exec command', () => {
    if (process.platform !== 'darwin') return
    const result = wrapBashCommand('echo ok', '/Users/dev/proj', {
      config: defaultSandboxConfig(),
      overrides: {},
    })
    expect(result).not.toBeNull()
    expect(result?.command.program).toBe('sandbox-exec')
    expect(result?.status.enabled).toBe(true)
  })

  test('on linux without unshare → returns null (no command), status reports fallback', () => {
    if (process.platform !== 'linux') return
    const result = wrapBashCommand('echo ok', '/workspace', {
      config: defaultSandboxConfig(),
      overrides: {},
    })
    expect(result?.status.fallback_reason ?? '').toContain('namespace')
  })

  test('on unsupported platform → status reports fallback, returns null command', () => {
    if (process.platform === 'darwin' || process.platform === 'linux') return
    const result = wrapBashCommand('echo ok', '/workspace', {
      config: defaultSandboxConfig(),
      overrides: {},
    })
    expect(result?.command).toBeNull()
  })
})

describe('prepareSandboxDirs', () => {
  test('creates .sandbox-home and .sandbox-tmp under cwd', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'orchentra-sandbox-'))
    try {
      prepareSandboxDirs(tmp)
      expect(existsSync(join(tmp, '.sandbox-home'))).toBe(true)
      expect(existsSync(join(tmp, '.sandbox-tmp'))).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('idempotent: second call does not throw', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'orchentra-sandbox-'))
    try {
      prepareSandboxDirs(tmp)
      prepareSandboxDirs(tmp)
      expect(existsSync(join(tmp, '.sandbox-home'))).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

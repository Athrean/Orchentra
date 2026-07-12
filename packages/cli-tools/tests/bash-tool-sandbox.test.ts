import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { resolveBashSpawn } from '../src/tools/bash-tool'

describe('resolveBashSpawn', () => {
  const originalDisabled = process.env.ORCHENTRA_SANDBOX_DISABLED
  beforeEach(() => {
    delete process.env.ORCHENTRA_SANDBOX_DISABLED
  })
  afterEach(() => {
    if (originalDisabled === undefined) delete process.env.ORCHENTRA_SANDBOX_DISABLED
    else process.env.ORCHENTRA_SANDBOX_DISABLED = originalDisabled
  })

  test('a model-passed dangerously_disable_sandbox flag no longer bypasses the sandbox', () => {
    if (process.platform !== 'darwin') return
    // Regression for the audit-flagged hole: the flag was removed from the
    // tool schema; even a stray extra property must not reach a direct spawn.
    const input = { command: 'echo ok', dangerously_disable_sandbox: true } as unknown as { command: string }
    const r = resolveBashSpawn(input, { cwd: '/Users/dev/proj' })
    expect(r.program).toBe('sandbox-exec')
    expect(r.sandboxStatus?.enabled).toBe(true)
  })

  test('ORCHENTRA_SANDBOX_DISABLED=1 → direct spawn', () => {
    process.env.ORCHENTRA_SANDBOX_DISABLED = '1'
    const r = resolveBashSpawn({ command: 'echo ok' }, { cwd: '/Users/dev/proj' })
    expect(r.program).toBe('sh')
    expect(r.sandboxStatus).toBeUndefined()
  })

  test('on darwin, default → wraps via sandbox-exec', () => {
    if (process.platform !== 'darwin') return
    const r = resolveBashSpawn({ command: 'echo ok' }, { cwd: '/Users/dev/proj' })
    expect(r.program).toBe('sandbox-exec')
    expect(r.args[0]).toBe('-p')
    expect(r.args[1]).toContain('(deny default)')
    expect(r.sandboxStatus?.enabled).toBe(true)
    expect(r.sandboxStatus?.filesystem_active).toBe(true)
  })

  test('on darwin, default → env carries HOME=<cwd>/.sandbox-home', () => {
    if (process.platform !== 'darwin') return
    const r = resolveBashSpawn({ command: 'echo ok' }, { cwd: '/Users/dev/proj' })
    const envMap = new Map(r.env ?? [])
    expect(envMap.get('HOME')).toBe('/Users/dev/proj/.sandbox-home')
  })

  test('command preserved verbatim through sandbox wrapper', () => {
    if (process.platform !== 'darwin') return
    const r = resolveBashSpawn({ command: 'echo "hello world"' }, { cwd: '/Users/dev/proj' })
    expect(r.args[r.args.length - 1]).toBe('echo "hello world"')
  })

  test('permissionMode = danger-full-access → bypass sandbox', () => {
    const r = resolveBashSpawn({ command: 'echo ok' }, { cwd: '/Users/dev/proj', permissionMode: 'danger-full-access' })
    expect(r.program).toBe('sh')
    expect(r.args).toEqual(['-c', 'echo ok'])
    expect(r.sandboxStatus).toBeUndefined()
  })

  test('permissionMode = workspace-write → sandbox still applies', () => {
    if (process.platform !== 'darwin') return
    const r = resolveBashSpawn({ command: 'echo ok' }, { cwd: '/Users/dev/proj', permissionMode: 'workspace-write' })
    expect(r.program).toBe('sandbox-exec')
  })

  test('permissionMode = read-only → sandbox still applies', () => {
    if (process.platform !== 'darwin') return
    const r = resolveBashSpawn({ command: 'echo ok' }, { cwd: '/Users/dev/proj', permissionMode: 'read-only' })
    expect(r.program).toBe('sandbox-exec')
  })
})

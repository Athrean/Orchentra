import { describe, expect, test } from 'bun:test'
import { buildMacosSandboxProfile } from '../src/sandbox/macos-profile'
import { resolveRequest, resolveSandboxStatusForRequest } from '../src/sandbox/resolve'
import { defaultSandboxConfig } from '../src/sandbox/types'

const probe = {
  namespaceSupported: () => false,
  containerEnvironment: () => ({ in_container: false, markers: [] }),
}

function statusFor(
  overrides: Parameters<typeof resolveRequest>[1],
  cwd = '/Users/dev/proj',
): ReturnType<typeof resolveSandboxStatusForRequest> {
  return resolveSandboxStatusForRequest(resolveRequest(defaultSandboxConfig(), overrides), cwd, probe)
}

describe('buildMacosSandboxProfile — header + baseline', () => {
  test('starts with (version 1)', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({}))
    expect(p.startsWith('(version 1)')).toBe(true)
  })

  test('contains (deny default) baseline', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({}))
    expect(p).toContain('(deny default)')
  })

  test('allows file-read* everywhere (read-only world)', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({}))
    expect(p).toContain('(allow file-read*)')
  })

  test('allows process-fork + process-exec (helper spawns)', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({}))
    expect(p).toContain('(allow process-fork)')
    expect(p).toContain('(allow process-exec)')
  })

  test('allows mach-lookup + sysctl-read (common system services)', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({}))
    expect(p).toContain('(allow mach-lookup)')
    expect(p).toContain('(allow sysctl-read)')
  })

  test('allows ipc-posix-shm + ipc-posix-sem (compiler/build needs)', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({}))
    expect(p).toContain('(allow ipc-posix-shm)')
    expect(p).toContain('(allow ipc-posix-sem)')
  })
})

describe('buildMacosSandboxProfile — workspace-only mode', () => {
  test('allows file-write* under cwd subpath', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({}))
    expect(p).toContain('(allow file-write* (subpath "/Users/dev/proj"))')
  })

  test('allows file-write* under /tmp + /private/tmp', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({}))
    expect(p).toContain('(allow file-write* (subpath "/tmp"))')
    expect(p).toContain('(allow file-write* (subpath "/private/tmp"))')
  })

  test('allows file-write* under common build caches (~/Library/Caches, ~/.npm, ~/.cargo)', () => {
    const homeOriginal = process.env.HOME
    process.env.HOME = '/Users/dev'
    try {
      const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({}))
      expect(p).toContain('(allow file-write* (subpath "/Users/dev/Library/Caches"))')
      expect(p).toContain('(allow file-write* (subpath "/Users/dev/.npm"))')
      expect(p).toContain('(allow file-write* (subpath "/Users/dev/.cargo"))')
    } finally {
      if (homeOriginal === undefined) delete process.env.HOME
      else process.env.HOME = homeOriginal
    }
  })

  test('allows file-write* under .sandbox-home + .sandbox-tmp', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({}))
    expect(p).toContain('(allow file-write* (subpath "/Users/dev/proj/.sandbox-home"))')
    expect(p).toContain('(allow file-write* (subpath "/Users/dev/proj/.sandbox-tmp"))')
  })
})

describe('buildMacosSandboxProfile — network', () => {
  test('network NOT isolated → allow network*', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({}))
    expect(p).toContain('(allow network*)')
  })

  test('network isolated → no allow network*', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({ network_isolation: true }))
    expect(p).not.toContain('(allow network*)')
  })
})

describe('buildMacosSandboxProfile — allow-list mode', () => {
  test('emits one (allow file-write* (subpath ...)) per allowed_mount', () => {
    const p = buildMacosSandboxProfile(
      '/Users/dev/proj',
      statusFor({
        filesystem_mode: 'allow-list',
        allowed_mounts: ['/var/lib/build', '/opt/cache'],
      }),
    )
    expect(p).toContain('(allow file-write* (subpath "/var/lib/build"))')
    expect(p).toContain('(allow file-write* (subpath "/opt/cache"))')
  })

  test('allow-list mode still grants cwd + sandbox-home + sandbox-tmp', () => {
    const p = buildMacosSandboxProfile(
      '/Users/dev/proj',
      statusFor({
        filesystem_mode: 'allow-list',
        allowed_mounts: ['/var/lib/build'],
      }),
    )
    expect(p).toContain('(allow file-write* (subpath "/Users/dev/proj"))')
    expect(p).toContain('(allow file-write* (subpath "/Users/dev/proj/.sandbox-home"))')
  })
})

describe('buildMacosSandboxProfile — off mode', () => {
  test('filesystem mode = off → no file-write* clauses (no FS isolation)', () => {
    const p = buildMacosSandboxProfile('/Users/dev/proj', statusFor({ filesystem_mode: 'off' }))
    expect(p).not.toContain('file-write*')
  })
})

describe('buildMacosSandboxProfile — path safety', () => {
  test('paths containing double-quotes are escaped', () => {
    const p = buildMacosSandboxProfile('/Users/dev/pro"j', statusFor({}, '/Users/dev/pro"j'))
    expect(p).toContain('"/Users/dev/pro\\"j"')
  })

  test('paths containing backslashes are escaped', () => {
    const p = buildMacosSandboxProfile('/Users/dev/pro\\j', statusFor({}, '/Users/dev/pro\\j'))
    expect(p).toContain('"/Users/dev/pro\\\\j"')
  })
})

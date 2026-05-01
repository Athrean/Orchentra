import { describe, expect, test } from 'bun:test'
import { buildMacosSandboxCommand, macosCapabilityProbe } from '../src/sandbox/macos'
import { resolveRequest, resolveSandboxStatusForRequest } from '../src/sandbox/resolve'
import { defaultSandboxConfig } from '../src/sandbox/types'

const linuxLikeProbe = {
  namespaceSupported: () => true,
  containerEnvironment: () => ({ in_container: false, markers: [] }),
}

function statusFor(
  overrides: Parameters<typeof resolveRequest>[1],
  cwd = '/Users/dev/proj',
): ReturnType<typeof resolveSandboxStatusForRequest> {
  return resolveSandboxStatusForRequest(resolveRequest(defaultSandboxConfig(), overrides), cwd, linuxLikeProbe)
}

describe('buildMacosSandboxCommand', () => {
  test('disabled status → null (no sandbox wrapper)', () => {
    const cmd = buildMacosSandboxCommand('echo ok', '/Users/dev/proj', {
      ...statusFor({}),
      enabled: false,
    })
    expect(cmd).toBeNull()
  })

  test('filesystem mode = off + network not isolated → null (nothing to enforce)', () => {
    const cmd = buildMacosSandboxCommand('echo ok', '/Users/dev/proj', statusFor({ filesystem_mode: 'off' }))
    expect(cmd).toBeNull()
  })

  test('enabled + workspace-only → returns sandbox-exec command', () => {
    const cmd = buildMacosSandboxCommand('echo ok', '/Users/dev/proj', statusFor({}))
    expect(cmd).not.toBeNull()
    expect(cmd?.program).toBe('sandbox-exec')
  })

  test('args: -p <profile> sh -lc <cmd>', () => {
    const cmd = buildMacosSandboxCommand('echo ok', '/Users/dev/proj', statusFor({}))
    expect(cmd?.args[0]).toBe('-p')
    expect(cmd?.args[1]).toContain('(version 1)')
    expect(cmd?.args[1]).toContain('(deny default)')
    expect(cmd?.args[2]).toBe('sh')
    expect(cmd?.args[3]).toBe('-lc')
    expect(cmd?.args[4]).toBe('echo ok')
  })

  test('env: HOME redirected to <cwd>/.sandbox-home, TMPDIR to <cwd>/.sandbox-tmp', () => {
    const cmd = buildMacosSandboxCommand('echo ok', '/Users/dev/proj', statusFor({}))
    const envMap = new Map(cmd?.env ?? [])
    expect(envMap.get('HOME')).toBe('/Users/dev/proj/.sandbox-home')
    expect(envMap.get('TMPDIR')).toBe('/Users/dev/proj/.sandbox-tmp')
  })

  test('env: PATH passed through from process.env', () => {
    const cmd = buildMacosSandboxCommand('echo ok', '/Users/dev/proj', statusFor({}))
    const envMap = new Map(cmd?.env ?? [])
    expect(envMap.get('PATH')).toBe(process.env.PATH ?? '')
  })

  test('env: ORCHENTRA_SANDBOX_FILESYSTEM_MODE + ORCHENTRA_SANDBOX_ALLOWED_MOUNTS surfaced', () => {
    const cmd = buildMacosSandboxCommand(
      'echo ok',
      '/Users/dev/proj',
      statusFor({ filesystem_mode: 'allow-list', allowed_mounts: ['/var/lib/build'] }),
    )
    const envMap = new Map(cmd?.env ?? [])
    expect(envMap.get('ORCHENTRA_SANDBOX_FILESYSTEM_MODE')).toBe('allow-list')
    expect(envMap.get('ORCHENTRA_SANDBOX_ALLOWED_MOUNTS')).toContain('/var/lib/build')
  })

  test('filesystem off + network_isolation true → returns sandbox-exec (network still enforced)', () => {
    const cmd = buildMacosSandboxCommand(
      'echo ok',
      '/Users/dev/proj',
      statusFor({ filesystem_mode: 'off', network_isolation: true }),
    )
    expect(cmd).not.toBeNull()
  })
})

describe('macosCapabilityProbe', () => {
  test('on darwin → namespaceSupported false (macOS does not have Linux namespaces)', () => {
    const probe = macosCapabilityProbe()
    expect(probe.namespaceSupported()).toBe(false)
  })

  test('returns container environment from real detect (no markers on bare host)', () => {
    const probe = macosCapabilityProbe()
    const env = probe.containerEnvironment()
    expect(typeof env.in_container).toBe('boolean')
    expect(Array.isArray(env.markers)).toBe(true)
  })
})

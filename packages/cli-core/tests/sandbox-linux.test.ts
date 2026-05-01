import { describe, expect, test } from 'bun:test'
import { buildLinuxSandboxCommand } from '../src/sandbox/linux'
import { resolveRequest, resolveSandboxStatusForRequest } from '../src/sandbox/resolve'
import { defaultSandboxConfig } from '../src/sandbox/types'

const linuxLikeProbe = {
  namespaceSupported: () => true,
  containerEnvironment: () => ({ in_container: false, markers: [] }),
}

function statusFor(
  overrides: Parameters<typeof resolveRequest>[1],
  cwd = '/workspace',
): ReturnType<typeof resolveSandboxStatusForRequest> {
  return resolveSandboxStatusForRequest(resolveRequest(defaultSandboxConfig(), overrides), cwd, linuxLikeProbe)
}

describe('buildLinuxSandboxCommand', () => {
  test('disabled status → null', () => {
    const cmd = buildLinuxSandboxCommand('echo ok', '/workspace', {
      ...statusFor({}),
      enabled: false,
    })
    expect(cmd).toBeNull()
  })

  test('namespace inactive AND network inactive → null (nothing to wrap)', () => {
    const cmd = buildLinuxSandboxCommand('echo ok', '/workspace', {
      ...statusFor({}),
      namespace_active: false,
      network_active: false,
    })
    expect(cmd).toBeNull()
  })

  test('namespace active → returns unshare launcher', () => {
    const cmd = buildLinuxSandboxCommand('echo ok', '/workspace', statusFor({}))
    expect(cmd).not.toBeNull()
    expect(cmd?.program).toBe('unshare')
  })

  test('default args include --user --map-root-user --mount --ipc --pid --uts --fork', () => {
    const cmd = buildLinuxSandboxCommand('echo ok', '/workspace', statusFor({}))
    for (const flag of ['--user', '--map-root-user', '--mount', '--ipc', '--pid', '--uts', '--fork']) {
      expect(cmd?.args).toContain(flag)
    }
  })

  test('network active → --net flag added', () => {
    const cmd = buildLinuxSandboxCommand('echo ok', '/workspace', statusFor({ network_isolation: true }))
    expect(cmd?.args).toContain('--net')
  })

  test('network inactive → no --net flag', () => {
    const cmd = buildLinuxSandboxCommand('echo ok', '/workspace', statusFor({}))
    expect(cmd?.args).not.toContain('--net')
  })

  test('args end with sh -lc <command>', () => {
    const cmd = buildLinuxSandboxCommand('echo ok', '/workspace', statusFor({}))
    const a = cmd?.args ?? []
    expect(a[a.length - 3]).toBe('sh')
    expect(a[a.length - 2]).toBe('-lc')
    expect(a[a.length - 1]).toBe('echo ok')
  })

  test('env: HOME=<cwd>/.sandbox-home, TMPDIR=<cwd>/.sandbox-tmp', () => {
    const cmd = buildLinuxSandboxCommand('echo ok', '/workspace', statusFor({}))
    const envMap = new Map(cmd?.env ?? [])
    expect(envMap.get('HOME')).toBe('/workspace/.sandbox-home')
    expect(envMap.get('TMPDIR')).toBe('/workspace/.sandbox-tmp')
  })

  test('env: ORCHENTRA_SANDBOX_FILESYSTEM_MODE + ORCHENTRA_SANDBOX_ALLOWED_MOUNTS surfaced', () => {
    const cmd = buildLinuxSandboxCommand(
      'echo ok',
      '/workspace',
      statusFor({ filesystem_mode: 'allow-list', allowed_mounts: ['/var/lib/build', '/opt/cache'] }),
    )
    const envMap = new Map(cmd?.env ?? [])
    expect(envMap.get('ORCHENTRA_SANDBOX_FILESYSTEM_MODE')).toBe('allow-list')
    expect(envMap.get('ORCHENTRA_SANDBOX_ALLOWED_MOUNTS')).toBe('/var/lib/build:/opt/cache')
  })

  test('env: PATH passed through', () => {
    const cmd = buildLinuxSandboxCommand('echo ok', '/workspace', statusFor({}))
    const envMap = new Map(cmd?.env ?? [])
    expect(envMap.get('PATH')).toBe(process.env.PATH ?? '')
  })
})

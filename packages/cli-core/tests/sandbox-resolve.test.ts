import { describe, expect, test } from 'bun:test'
import { resolveRequest, resolveSandboxStatusForRequest, type SandboxCapabilityProbe } from '../src/sandbox/resolve'
import { defaultSandboxConfig } from '../src/sandbox/types'

const noopProbe: SandboxCapabilityProbe = {
  namespaceSupported: () => false,
  containerEnvironment: () => ({ in_container: false, markers: [] }),
}
const linuxProbe: SandboxCapabilityProbe = {
  namespaceSupported: () => true,
  containerEnvironment: () => ({ in_container: false, markers: [] }),
}

describe('resolveRequest', () => {
  test('empty config + no overrides → enabled true, namespace true, network false, workspace-only', () => {
    const r = resolveRequest(defaultSandboxConfig(), {})
    expect(r.enabled).toBe(true)
    expect(r.namespace_restrictions).toBe(true)
    expect(r.network_isolation).toBe(false)
    expect(r.filesystem_mode).toBe('workspace-only')
    expect(r.allowed_mounts).toEqual([])
  })

  test('config explicitly disables → enabled false', () => {
    const r = resolveRequest({ ...defaultSandboxConfig(), enabled: false }, {})
    expect(r.enabled).toBe(false)
  })

  test('per-call override beats config', () => {
    const r = resolveRequest(
      { ...defaultSandboxConfig(), enabled: false, network_isolation: false },
      { enabled: true, network_isolation: true },
    )
    expect(r.enabled).toBe(true)
    expect(r.network_isolation).toBe(true)
  })

  test('filesystem_mode override wins over config', () => {
    const r = resolveRequest(
      { ...defaultSandboxConfig(), filesystem_mode: 'workspace-only' },
      { filesystem_mode: 'allow-list' },
    )
    expect(r.filesystem_mode).toBe('allow-list')
  })

  test('allowed_mounts override replaces (not merges) config', () => {
    const r = resolveRequest({ ...defaultSandboxConfig(), allowed_mounts: ['logs'] }, { allowed_mounts: ['tmp'] })
    expect(r.allowed_mounts).toEqual(['tmp'])
  })
})

describe('resolveSandboxStatusForRequest', () => {
  test('namespace requested but unsupported → fallback_reason set, namespace_active false', () => {
    const req = resolveRequest(defaultSandboxConfig(), {})
    const status = resolveSandboxStatusForRequest(req, '/workspace', noopProbe)
    expect(status.namespace_active).toBe(false)
    expect(status.namespace_supported).toBe(false)
    expect(status.fallback_reason).toContain('namespace')
  })

  test('namespace supported + requested → namespace_active true', () => {
    const req = resolveRequest(defaultSandboxConfig(), {})
    const status = resolveSandboxStatusForRequest(req, '/workspace', linuxProbe)
    expect(status.namespace_supported).toBe(true)
    expect(status.namespace_active).toBe(true)
  })

  test('network requested but unsupported → fallback_reason mentions network', () => {
    const req = resolveRequest(defaultSandboxConfig(), { network_isolation: true })
    const status = resolveSandboxStatusForRequest(req, '/workspace', noopProbe)
    expect(status.fallback_reason).toContain('network')
  })

  test('allow-list with no mounts → fallback_reason mentions allow-list', () => {
    const req = resolveRequest(defaultSandboxConfig(), { filesystem_mode: 'allow-list' })
    const status = resolveSandboxStatusForRequest(req, '/workspace', linuxProbe)
    expect(status.fallback_reason).toContain('allow-list')
  })

  test('disabled → active false, supported still reflects probe', () => {
    const req = resolveRequest({ ...defaultSandboxConfig(), enabled: false }, {})
    const status = resolveSandboxStatusForRequest(req, '/workspace', linuxProbe)
    expect(status.active).toBe(false)
    expect(status.namespace_supported).toBe(true)
    expect(status.namespace_active).toBe(false)
  })

  test('relative allowed_mounts get resolved against cwd', () => {
    const req = resolveRequest(defaultSandboxConfig(), {
      allowed_mounts: ['logs', '/var/lib/cache'],
    })
    const status = resolveSandboxStatusForRequest(req, '/workspace', linuxProbe)
    expect(status.allowed_mounts).toContain('/workspace/logs')
    expect(status.allowed_mounts).toContain('/var/lib/cache')
  })

  test('container environment surfaces in status', () => {
    const probe: SandboxCapabilityProbe = {
      namespaceSupported: () => true,
      containerEnvironment: () => ({
        in_container: true,
        markers: ['/.dockerenv', 'env:container=docker'],
      }),
    }
    const status = resolveSandboxStatusForRequest(resolveRequest(defaultSandboxConfig(), {}), '/workspace', probe)
    expect(status.in_container).toBe(true)
    expect(status.container_markers).toContain('/.dockerenv')
  })

  test('multiple fallback reasons are joined with semicolon', () => {
    const req = resolveRequest(defaultSandboxConfig(), {
      network_isolation: true,
      filesystem_mode: 'allow-list',
    })
    const status = resolveSandboxStatusForRequest(req, '/workspace', noopProbe)
    expect(status.fallback_reason).toContain(';')
    expect(status.fallback_reason).toContain('namespace')
    expect(status.fallback_reason).toContain('network')
    expect(status.fallback_reason).toContain('allow-list')
  })

  test('filesystem_active true when enabled + mode != off', () => {
    const req = resolveRequest(defaultSandboxConfig(), {})
    const status = resolveSandboxStatusForRequest(req, '/workspace', linuxProbe)
    expect(status.filesystem_active).toBe(true)
  })

  test('filesystem_active false when mode = off', () => {
    const req = resolveRequest(defaultSandboxConfig(), { filesystem_mode: 'off' })
    const status = resolveSandboxStatusForRequest(req, '/workspace', linuxProbe)
    expect(status.filesystem_active).toBe(false)
  })
})

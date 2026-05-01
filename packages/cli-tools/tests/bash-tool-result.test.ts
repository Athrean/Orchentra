import { describe, expect, test } from 'bun:test'
import { formatSandboxStatusLine } from '../src/tools/bash-tool'
import type { SandboxStatus } from '@orchentra/cli-core'

function status(overrides: Partial<SandboxStatus> = {}): SandboxStatus {
  return {
    enabled: true,
    requested: {
      enabled: true,
      namespace_restrictions: true,
      network_isolation: false,
      filesystem_mode: 'workspace-only',
      allowed_mounts: [],
    },
    supported: false,
    active: false,
    namespace_supported: false,
    namespace_active: false,
    network_supported: false,
    network_active: false,
    filesystem_mode: 'workspace-only',
    filesystem_active: true,
    allowed_mounts: [],
    in_container: false,
    container_markers: [],
    fallback_reason: undefined,
    ...overrides,
  }
}

describe('formatSandboxStatusLine', () => {
  test('disabled status → empty string (nothing to surface)', () => {
    const line = formatSandboxStatusLine(status({ enabled: false, filesystem_active: false }))
    expect(line).toBe('')
  })

  test('enabled + filesystem_active → mentions mode + active', () => {
    const line = formatSandboxStatusLine(status({}))
    expect(line).toContain('sandbox')
    expect(line).toContain('workspace-only')
    expect(line).toContain('active')
  })

  test('fallback_reason surfaced inline', () => {
    const line = formatSandboxStatusLine(status({ fallback_reason: 'namespace isolation unavailable' }))
    expect(line).toContain('namespace isolation unavailable')
  })

  test('network_isolation requested → "network: isolated"', () => {
    const line = formatSandboxStatusLine(
      status({
        requested: {
          enabled: true,
          namespace_restrictions: true,
          network_isolation: true,
          filesystem_mode: 'workspace-only',
          allowed_mounts: [],
        },
        network_active: true,
      }),
    )
    expect(line).toContain('network')
  })

  test('in_container → mentions container', () => {
    const line = formatSandboxStatusLine(status({ in_container: true, container_markers: ['/.dockerenv'] }))
    expect(line).toContain('container')
  })

  test('line is single-line (no embedded newlines)', () => {
    const line = formatSandboxStatusLine(status({}))
    expect(line).not.toContain('\n')
  })
})

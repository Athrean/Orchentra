import { describe, expect, test } from 'bun:test'
import {
  defaultSandboxConfig,
  defaultSandboxRequest,
  defaultSandboxStatus,
  filesystemModeAsString,
  type FilesystemIsolationMode,
} from '../src/sandbox/types'

describe('FilesystemIsolationMode', () => {
  test('off → "off"', () => {
    expect(filesystemModeAsString('off')).toBe('off')
  })

  test('workspace-only → "workspace-only"', () => {
    expect(filesystemModeAsString('workspace-only')).toBe('workspace-only')
  })

  test('allow-list → "allow-list"', () => {
    expect(filesystemModeAsString('allow-list')).toBe('allow-list')
  })

  test('default mode is workspace-only', () => {
    const mode: FilesystemIsolationMode = defaultSandboxRequest().filesystem_mode
    expect(mode).toBe('workspace-only')
  })
})

describe('SandboxConfig defaults', () => {
  test('all undefined except allowed_mounts', () => {
    const c = defaultSandboxConfig()
    expect(c.enabled).toBeUndefined()
    expect(c.namespace_restrictions).toBeUndefined()
    expect(c.network_isolation).toBeUndefined()
    expect(c.filesystem_mode).toBeUndefined()
    expect(c.allowed_mounts).toEqual([])
  })
})

describe('SandboxRequest defaults', () => {
  test('all flags false, fs workspace-only, no mounts (matches Rust Default::default())', () => {
    const r = defaultSandboxRequest()
    expect(r.enabled).toBe(false)
    expect(r.namespace_restrictions).toBe(false)
    expect(r.network_isolation).toBe(false)
    expect(r.filesystem_mode).toBe('workspace-only')
    expect(r.allowed_mounts).toEqual([])
  })
})

describe('SandboxStatus defaults', () => {
  test('all flags false, no fallback, empty markers/mounts', () => {
    const s = defaultSandboxStatus()
    expect(s.enabled).toBe(false)
    expect(s.supported).toBe(false)
    expect(s.active).toBe(false)
    expect(s.namespace_supported).toBe(false)
    expect(s.namespace_active).toBe(false)
    expect(s.network_supported).toBe(false)
    expect(s.network_active).toBe(false)
    expect(s.filesystem_active).toBe(false)
    expect(s.filesystem_mode).toBe('workspace-only')
    expect(s.allowed_mounts).toEqual([])
    expect(s.in_container).toBe(false)
    expect(s.container_markers).toEqual([])
    expect(s.fallback_reason).toBeUndefined()
  })
})

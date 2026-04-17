import { describe, expect, test } from 'bun:test'
import { decide, isPermissionMode } from '../src/runtime/permissions'

describe('decide', () => {
  test('danger-full-access allows everything without confirmation', () => {
    for (const level of ['read', 'write', 'admin'] as const) {
      const d = decide('danger-full-access', level)
      expect(d.allowed).toBe(true)
      expect(d.requiresConfirmation).toBe(false)
    }
  })

  test('read-only allows read, blocks write and admin', () => {
    expect(decide('read-only', 'read').allowed).toBe(true)
    expect(decide('read-only', 'write').allowed).toBe(false)
    expect(decide('read-only', 'admin').allowed).toBe(false)
  })

  test('prompt-on-write allows read, confirms write, blocks admin', () => {
    expect(decide('prompt-on-write', 'read')).toEqual({
      allowed: true,
      requiresConfirmation: false,
    })
    expect(decide('prompt-on-write', 'write')).toEqual({
      allowed: true,
      requiresConfirmation: true,
    })
    expect(decide('prompt-on-write', 'admin').allowed).toBe(false)
  })
})

describe('isPermissionMode', () => {
  test('accepts valid modes', () => {
    expect(isPermissionMode('read-only')).toBe(true)
    expect(isPermissionMode('prompt-on-write')).toBe(true)
    expect(isPermissionMode('danger-full-access')).toBe(true)
  })

  test('rejects invalid strings', () => {
    expect(isPermissionMode('admin')).toBe(false)
    expect(isPermissionMode('')).toBe(false)
  })
})

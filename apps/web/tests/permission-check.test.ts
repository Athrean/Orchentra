import { describe, expect, test } from 'bun:test'
import { hasPermission, mergePermissions, permissionGap } from '../lib/github/permission-check'

describe('hasPermission', () => {
  test('false when the key is absent', () => {
    expect(hasPermission({}, 'actions')).toBe(false)
  })

  test('read is satisfied by read, write, or admin', () => {
    expect(hasPermission({ actions: 'read' }, 'actions', 'read')).toBe(true)
    expect(hasPermission({ actions: 'write' }, 'actions', 'read')).toBe(true)
    expect(hasPermission({ actions: 'admin' }, 'actions', 'read')).toBe(true)
  })

  test('write is not satisfied by read', () => {
    expect(hasPermission({ actions: 'read' }, 'actions', 'write')).toBe(false)
    expect(hasPermission({ actions: 'write' }, 'actions', 'write')).toBe(true)
  })

  test('admin requires admin', () => {
    expect(hasPermission({ administration: 'write' }, 'administration', 'admin')).toBe(false)
    expect(hasPermission({ administration: 'admin' }, 'administration', 'admin')).toBe(true)
  })
})

describe('permissionGap', () => {
  test('returns only the unsatisfied requirements', () => {
    const gap = permissionGap({ actions: 'read', checks: 'read' }, [
      { key: 'actions', level: 'read' },
      { key: 'pull_requests', level: 'write' },
    ])
    expect(gap).toEqual([{ key: 'pull_requests', level: 'write' }])
  })
})

describe('mergePermissions', () => {
  test('takes the most permissive level per key across snapshots', () => {
    const merged = mergePermissions([
      { actions: 'read', contents: 'read' },
      { actions: 'write', checks: 'read' },
    ])
    expect(merged).toEqual({ actions: 'write', contents: 'read', checks: 'read' })
  })
})

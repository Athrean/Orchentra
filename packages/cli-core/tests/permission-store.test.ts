import { describe, expect, test } from 'bun:test'
import { createPermissionStore } from '../src/permissions/store'

describe('PermissionStore — empty', () => {
  test('returns "unknown" before any rules are remembered', () => {
    const store = createPermissionStore()
    expect(store.decide('bash', { command: 'gh issue list' })).toBe('unknown')
  })
})

describe('PermissionStore — glob matching', () => {
  test('exact pattern matches the flattened bash command', () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: 'gh issue list', decision: 'allow' })
    expect(store.decide('bash', { command: 'gh issue list' })).toBe('allow')
  })

  test('"*" wildcard matches any tail', () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: 'gh issue *', decision: 'allow' })
    expect(store.decide('bash', { command: 'gh issue list --state open' })).toBe('allow')
    expect(store.decide('bash', { command: 'gh issue create' })).toBe('allow')
    expect(store.decide('bash', { command: 'gh pr list' })).toBe('unknown')
  })

  test('rule scoped to one tool does not match a different tool', () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: '*', decision: 'allow' })
    expect(store.decide('write', { path: '/tmp/x' })).toBe('unknown')
  })

  test('non-bash tools match against JSON-stringified args', () => {
    const store = createPermissionStore()
    store.remember({ tool: 'write', pattern: '*"path":"/tmp/*', decision: 'allow' })
    expect(store.decide('write', { path: '/tmp/foo.txt', content: 'x' })).toBe('allow')
    expect(store.decide('write', { path: '/etc/passwd', content: 'x' })).toBe('unknown')
  })
})

describe('PermissionStore — precedence', () => {
  test('deny wins when both an allow and a deny rule match', () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: 'gh *', decision: 'allow' })
    store.remember({ tool: 'bash', pattern: 'gh issue delete *', decision: 'deny' })
    expect(store.decide('bash', { command: 'gh issue list' })).toBe('allow')
    expect(store.decide('bash', { command: 'gh issue delete 42' })).toBe('deny')
  })
})

describe('PermissionStore — bookkeeping', () => {
  test('remember is idempotent — duplicates do not stack', () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: 'ls *', decision: 'allow' })
    store.remember({ tool: 'bash', pattern: 'ls *', decision: 'allow' })
    expect(store.list()).toHaveLength(1)
  })

  test('list preserves insertion order', () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: 'a', decision: 'allow' })
    store.remember({ tool: 'bash', pattern: 'b', decision: 'deny' })
    store.remember({ tool: 'bash', pattern: 'c', decision: 'allow' })
    expect(store.list().map((r) => r.pattern)).toEqual(['a', 'b', 'c'])
  })
})

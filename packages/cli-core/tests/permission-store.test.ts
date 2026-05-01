import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPermissionStore } from '../src/permissions/store'

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'perm-store-'))
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

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

describe('PermissionStore — workspace persistence', () => {
  test('round-trip: remember then re-instantiate with same cwd → rule still present', () => {
    withTempDir((cwd) => {
      const a = createPermissionStore({ cwd })
      a.remember({ tool: 'bash', pattern: 'gh issue *', decision: 'allow' })
      const b = createPermissionStore({ cwd })
      expect(b.list().map((r) => ({ tool: r.tool, pattern: r.pattern, decision: r.decision }))).toEqual([
        { tool: 'bash', pattern: 'gh issue *', decision: 'allow' },
      ])
      expect(b.decide('bash', { command: 'gh issue list' })).toBe('allow')
    })
  })

  test('persisted rules carry an addedAt ISO timestamp', () => {
    withTempDir((cwd) => {
      const store = createPermissionStore({ cwd })
      store.remember({ tool: 'bash', pattern: 'ls *', decision: 'allow' })
      const raw = readFileSync(join(cwd, '.orchentra', 'permissions.json'), 'utf8')
      const parsed = JSON.parse(raw) as { version: number; rules: { addedAt?: string }[] }
      expect(parsed.version).toBe(1)
      expect(parsed.rules[0]?.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  test('malformed JSON file → empty store, no crash', () => {
    withTempDir((cwd) => {
      mkdirSync(join(cwd, '.orchentra'), { recursive: true })
      writeFileSync(join(cwd, '.orchentra', 'permissions.json'), '{not json')
      const store = createPermissionStore({ cwd })
      expect(store.list()).toEqual([])
    })
  })

  test('schema-version mismatch → empty store, no crash', () => {
    withTempDir((cwd) => {
      mkdirSync(join(cwd, '.orchentra'), { recursive: true })
      writeFileSync(
        join(cwd, '.orchentra', 'permissions.json'),
        JSON.stringify({ version: 99, rules: [{ tool: 'bash', pattern: 'x', decision: 'allow' }] }),
      )
      const store = createPermissionStore({ cwd })
      expect(store.list()).toEqual([])
    })
  })
})

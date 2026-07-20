import { describe, expect, test } from 'bun:test'
import { runMigrations, MigrationError } from '../src/runtime/migrations'

describe('runMigrations', () => {
  test('runs each ordered vN -> vN+1 transform to reach the current version', () => {
    const migrated = runMigrations<{ version: number; label: string }>(
      { version: 1, label: 'a' },
      {
        current: 3,
        migrations: {
          1: (v) => ({ ...v, label: `${v.label as string}b` }),
          2: (v) => ({ ...v, label: `${v.label as string}c` }),
        },
      },
    )
    expect(migrated.label).toBe('abc')
    expect(migrated.version).toBe(3)
  })

  test('a value already at the current version is a no-op', () => {
    const spec = { current: 2, migrations: { 1: () => ({ touched: true }) } }
    const out = runMigrations<{ version: number; keep: string }>({ version: 2, keep: 'x' }, spec)
    expect(out).toEqual({ version: 2, keep: 'x' })
  })

  test('an absent version defaults to the floor (v1) so legacy files still migrate', () => {
    const out = runMigrations<{ version: number; label: string }>(
      { label: 'a' },
      { current: 2, migrations: { 1: (v) => ({ ...v, label: `${v.label as string}b` }) } },
    )
    expect(out.label).toBe('ab')
    expect(out.version).toBe(2)
  })

  test('a version newer than this build supports fails loudly', () => {
    expect(() => runMigrations({ version: 5 }, { current: 2 })).toThrow(MigrationError)
    expect(() => runMigrations({ version: 5 }, { current: 2 })).toThrow(/newer than this build/)
  })

  test('a gap with no transform fails loudly rather than silently skipping', () => {
    expect(() => runMigrations({ version: 1 }, { current: 3, migrations: { 1: (v) => v } })).toThrow(
      /no migration from version 2 to 3/,
    )
  })

  test('a non-integer or non-positive version fails loudly', () => {
    expect(() => runMigrations({ version: 'two' }, { current: 2 })).toThrow(MigrationError)
    expect(() => runMigrations({ version: 0 }, { current: 2 })).toThrow(MigrationError)
  })

  test('honors a custom versionKey', () => {
    const out = runMigrations<{ schema: number }>(
      { schema: 1 },
      { current: 2, versionKey: 'schema', migrations: { 1: (v) => v } },
    )
    expect(out.schema).toBe(2)
  })
})

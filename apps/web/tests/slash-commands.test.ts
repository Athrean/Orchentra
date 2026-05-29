import { describe, expect, test } from 'bun:test'
import { filterSlashCommands, parseSlashQuery } from '../lib/ai/commands'

describe('parseSlashQuery', () => {
  test('inactive when the value does not start with a slash', () => {
    expect(parseSlashQuery('hello')).toEqual({ active: false, query: '' })
  })

  test('active while typing the command name', () => {
    expect(parseSlashQuery('/rep')).toEqual({ active: true, query: 'rep' })
  })

  test('lowercases the query', () => {
    expect(parseSlashQuery('/REPO')).toEqual({ active: true, query: 'repo' })
  })

  test('inactive once a space follows the command (prompt has begun)', () => {
    expect(parseSlashQuery('/repo-health ')).toEqual({ active: false, query: '' })
  })
})

describe('filterSlashCommands', () => {
  test('matches by name fragment', () => {
    expect(filterSlashCommands('fail', true).map((c) => c.name)).toEqual(['failures'])
  })

  test('hides write commands unless act mode is allowed', () => {
    expect(filterSlashCommands('writeback', false)).toEqual([])
    expect(filterSlashCommands('writeback', true).map((c) => c.name)).toEqual(['writeback'])
  })

  test('empty query returns all read commands in ask mode', () => {
    const names = filterSlashCommands('', false).map((c) => c.name)
    expect(names).toContain('repo-health')
    expect(names).not.toContain('writeback')
  })
})

import { describe, expect, test } from 'bun:test'
import { operations } from '../src'

describe('operations array', () => {
  test('contains all five brain ops', () => {
    const ids = operations.map((op) => op.id)
    expect(ids).toContain('record_episode')
    expect(ids).toContain('list_episodes')
    expect(ids).toContain('get_runbook')
    expect(ids).toContain('list_runbooks')
    expect(ids).toContain('export_skills_md')
  })

  test('each brain op carries its expected scope', () => {
    const byId = new Map(operations.map((op) => [op.id, op] as const))
    expect(byId.get('record_episode')?.scope).toBe('write')
    expect(byId.get('list_episodes')?.scope).toBe('read')
    expect(byId.get('get_runbook')?.scope).toBe('read')
    expect(byId.get('list_runbooks')?.scope).toBe('read')
    expect(byId.get('export_skills_md')?.scope).toBe('read')
  })

  test('preserves the existing github ops alongside the brain ops', () => {
    const ids = operations.map((op) => op.id)
    expect(ids).toContain('get_workflow_logs')
    expect(ids).toContain('post_comment')
  })

  test('every operation id is unique', () => {
    const ids = operations.map((op) => op.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

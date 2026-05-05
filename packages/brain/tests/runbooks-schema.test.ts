import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { runbooks, runbookSkills } from '@orchentra/db'

describe('runbooks table schema', () => {
  test('table is named "runbooks"', () => {
    expect(getTableConfig(runbooks).name).toBe('runbooks')
  })

  test('has the expected columns', () => {
    const cols = getTableConfig(runbooks)
      .columns.map((c) => c.name)
      .sort()
    expect(cols).toEqual(['id', 'org_id', 'name', 'description', 'triggers', 'ops_used', 'body', 'created_at'].sort())
  })

  test('id is primary key, org_id is non-null', () => {
    const cfg = getTableConfig(runbooks)
    expect(cfg.columns.find((c) => c.name === 'id')?.primary).toBe(true)
    expect(cfg.columns.find((c) => c.name === 'org_id')?.notNull).toBe(true)
    expect(cfg.columns.find((c) => c.name === 'name')?.notNull).toBe(true)
    expect(cfg.columns.find((c) => c.name === 'body')?.notNull).toBe(true)
  })
})

describe('runbook_skills join table schema', () => {
  test('table is named "runbook_skills"', () => {
    expect(getTableConfig(runbookSkills).name).toBe('runbook_skills')
  })

  test('has runbook_id and skill_name columns', () => {
    const cols = getTableConfig(runbookSkills)
      .columns.map((c) => c.name)
      .sort()
    expect(cols).toEqual(['runbook_id', 'skill_name', 'created_at'].sort())
  })

  test('runbook_id and skill_name are non-null', () => {
    const cfg = getTableConfig(runbookSkills)
    expect(cfg.columns.find((c) => c.name === 'runbook_id')?.notNull).toBe(true)
    expect(cfg.columns.find((c) => c.name === 'skill_name')?.notNull).toBe(true)
  })
})

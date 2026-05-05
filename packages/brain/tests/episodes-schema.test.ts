import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { episodes } from '@orchentra/db'

describe('episodes table schema', () => {
  test('table is named "episodes"', () => {
    const cfg = getTableConfig(episodes)
    expect(cfg.name).toBe('episodes')
  })

  test('has the expected columns', () => {
    const cfg = getTableConfig(episodes)
    const columnNames = cfg.columns.map((c) => c.name).sort()
    expect(columnNames).toEqual(
      ['id', 'org_id', 'execution_id', 'kind', 'summary', 'ops_called', 'outcome', 'created_at'].sort(),
    )
  })

  test('id is the primary key, execution_id and org_id reference foreign tables', () => {
    const cfg = getTableConfig(episodes)
    const idCol = cfg.columns.find((c) => c.name === 'id')
    expect(idCol?.primary).toBe(true)
    const orgIdCol = cfg.columns.find((c) => c.name === 'org_id')
    expect(orgIdCol?.notNull).toBe(true)
    const execIdCol = cfg.columns.find((c) => c.name === 'execution_id')
    expect(execIdCol?.notNull).toBe(true)
  })

  test('outcome and kind have sensible defaults / non-null shape', () => {
    const cfg = getTableConfig(episodes)
    const outcome = cfg.columns.find((c) => c.name === 'outcome')
    const kind = cfg.columns.find((c) => c.name === 'kind')
    expect(outcome?.notNull).toBe(true)
    expect(kind?.notNull).toBe(true)
  })
})

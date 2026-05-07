import { describe, expect, test } from 'bun:test'
import { operations } from '@orchentra/operations'
import { categoryForOp, OP_CATEGORIES } from '../src/op-commands/help-categorizer'

describe('HelpCategorizer', () => {
  test('every op in the registry maps to a known category', () => {
    for (const op of operations) {
      const cat = categoryForOp(op.id)
      expect(OP_CATEGORIES).toContain(cat)
      expect(cat).not.toBe('Unknown')
    }
  })

  test('Pulls category includes get_pull_request and merge_pull_request', () => {
    expect(categoryForOp('get_pull_request')).toBe('Pulls')
    expect(categoryForOp('merge_pull_request')).toBe('Pulls')
  })

  test('Actions category includes workflow runs ops', () => {
    expect(categoryForOp('list_workflow_runs')).toBe('Actions')
    expect(categoryForOp('rerun_workflow')).toBe('Actions')
    expect(categoryForOp('cancel_workflow_run')).toBe('Actions')
  })

  test('Brain category includes episodes and runbooks ops', () => {
    expect(categoryForOp('list_episodes')).toBe('Brain')
    expect(categoryForOp('get_runbook')).toBe('Brain')
    expect(categoryForOp('export_skills_md')).toBe('Brain')
  })
})

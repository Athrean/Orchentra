import { describe, expect, test } from 'bun:test'
import { buildFixPrompt } from '../src/commands/fix'
import type { TriageBrief } from '../src/commands/brief'
import type { WorkflowRun } from '@orchentra/cli-api'

function fakeRun(): WorkflowRun {
  return {
    id: 42,
    name: 'CI',
    head_branch: 'main',
    head_sha: 'abc1234',
    event: 'push',
    status: 'completed',
    conclusion: 'failure',
    html_url: 'https://github.com/o/r/actions/runs/42',
    workflow_id: 1,
  }
}

function fakeBrief(): TriageBrief {
  return {
    summary: '1 job failed: test',
    details: 'TypeError on line 12',
  }
}

describe('buildFixPrompt — anti-bloat clauses', () => {
  test('forbids renames explicitly', () => {
    const prompt = buildFixPrompt(fakeRun(), fakeBrief())
    expect(prompt.toLowerCase()).toContain('rename')
  })

  test('forbids refactors explicitly', () => {
    const prompt = buildFixPrompt(fakeRun(), fakeBrief())
    expect(prompt.toLowerCase()).toContain('refactor')
  })

  test('forbids reorders explicitly', () => {
    const prompt = buildFixPrompt(fakeRun(), fakeBrief())
    expect(prompt.toLowerCase()).toContain('reorder')
  })

  test('forbids type hints', () => {
    const prompt = buildFixPrompt(fakeRun(), fakeBrief())
    expect(prompt.toLowerCase()).toContain('type hint')
  })

  test('forbids future flexibility abstractions', () => {
    const prompt = buildFixPrompt(fakeRun(), fakeBrief())
    expect(prompt.toLowerCase()).toContain('future flexibility')
  })

  test('forbids comment / formatting cleanup', () => {
    const prompt = buildFixPrompt(fakeRun(), fakeBrief())
    expect(prompt.toLowerCase()).toContain('comment')
    expect(prompt.toLowerCase()).toContain('formatting')
  })

  test('uses minimum-delta language', () => {
    const prompt = buildFixPrompt(fakeRun(), fakeBrief())
    expect(prompt.toLowerCase()).toContain('minimum')
  })

  test('still includes failure summary and head_sha', () => {
    const prompt = buildFixPrompt(fakeRun(), fakeBrief())
    expect(prompt).toContain('1 job failed: test')
    expect(prompt).toContain('abc1234')
  })
})

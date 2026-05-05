import { describe, expect, test } from 'bun:test'
import type { Episode, Runbook, Skill } from '../src'

describe('Episode type', () => {
  test('an Episode references the originating execution and lists the ops it called', () => {
    const ep: Episode = {
      id: 'ep_1',
      orgId: 'org_1',
      executionId: 'exec_1',
      kind: 'ci_failure',
      summary: 'Re-ran failed deploy after spotting transient timeout.',
      opsCalled: ['get_workflow_logs', 'get_pull_request'],
      outcome: 'success',
      createdAt: new Date('2026-04-29T10:00:00Z'),
    }
    expect(ep.id).toBe('ep_1')
    expect(ep.executionId).toBe('exec_1')
    expect(ep.opsCalled).toEqual(['get_workflow_logs', 'get_pull_request'])
    expect(ep.outcome).toBe('success')
  })

  test('Episode outcome supports success | failure | unknown', () => {
    const outcomes: Array<Episode['outcome']> = ['success', 'failure', 'unknown']
    expect(outcomes).toEqual(['success', 'failure', 'unknown'])
  })
})

describe('Runbook type', () => {
  test('a Runbook captures triggers, ops it relies on, and Markdown body', () => {
    const rb: Runbook = {
      id: 'rb_1',
      orgId: 'org_1',
      name: 'rerun-flaky-deploy',
      description: 'When a deploy fails on a known-flaky integration test, rerun once.',
      triggers: ['execution.kind:ci_failure', 'failed_step:integration_tests'],
      opsUsed: ['get_workflow_logs', 'post_comment'],
      body: '# rerun-flaky-deploy\n\nSteps:\n1. Inspect logs\n2. Comment on PR\n',
      createdAt: new Date('2026-04-29T11:00:00Z'),
    }
    expect(rb.name).toBe('rerun-flaky-deploy')
    expect(rb.triggers).toContain('execution.kind:ci_failure')
    expect(rb.opsUsed).toContain('post_comment')
    expect(rb.body).toContain('# rerun-flaky-deploy')
  })
})

describe('Skill type', () => {
  test('a Skill is a runbook re-shaped for export — name + description + body', () => {
    const sk: Skill = {
      name: 'rerun-flaky-deploy',
      description: 'When a deploy fails on a known-flaky integration test, rerun once.',
      triggers: ['execution.kind:ci_failure'],
      opsUsed: ['post_comment'],
      body: '# rerun-flaky-deploy\n\nSteps:\n1. Inspect logs\n',
    }
    expect(sk.name).toBe('rerun-flaky-deploy')
    expect(sk.body).toContain('Inspect logs')
  })
})

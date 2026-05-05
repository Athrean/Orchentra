import { describe, expect, test } from 'bun:test'
import { exportSkillMd } from '../src/export-skill'
import type { Runbook } from '../src/types'

const fixture: Runbook = {
  id: 'rb_1',
  orgId: 'org_1',
  name: 'rerun-flaky-deploy',
  description: 'When a deploy fails on a known-flaky integration test, rerun once.',
  triggers: ['execution.kind:ci_failure', 'failed_step:integration_tests'],
  opsUsed: ['get_workflow_logs', 'post_comment'],
  body: '# rerun-flaky-deploy\n\nSteps:\n1. Inspect logs\n2. Comment on PR\n',
  createdAt: new Date('2026-04-29T11:00:00Z'),
}

const expected = `---
name: rerun-flaky-deploy
description: When a deploy fails on a known-flaky integration test, rerun once.
triggers:
  - "execution.kind:ci_failure"
  - "failed_step:integration_tests"
ops_used:
  - get_workflow_logs
  - post_comment
---

# rerun-flaky-deploy

Steps:
1. Inspect logs
2. Comment on PR
`

describe('exportSkillMd', () => {
  test('renders frontmatter + body for a fully populated runbook', () => {
    expect(exportSkillMd(fixture)).toBe(expected)
  })

  test('empty triggers and ops_used render as explicit empty arrays', () => {
    const minimal: Runbook = { ...fixture, triggers: [], opsUsed: [], body: 'plain body\n' }
    const out = exportSkillMd(minimal)
    expect(out).toContain('triggers: []')
    expect(out).toContain('ops_used: []')
    expect(out.endsWith('plain body\n')).toBe(true)
  })

  test('is pure — identical input yields identical output', () => {
    expect(exportSkillMd(fixture)).toBe(exportSkillMd(fixture))
  })

  test('description with a colon is YAML-safe via double quotes', () => {
    const tricky: Runbook = { ...fixture, description: 'when X: do Y' }
    const out = exportSkillMd(tricky)
    expect(out).toContain('description: "when X: do Y"')
  })

  test('body without trailing newline gets one appended so cat-ed files are clean', () => {
    const noTrailingNl: Runbook = { ...fixture, body: 'no trailing nl' }
    const out = exportSkillMd(noTrailingNl)
    expect(out.endsWith('\n')).toBe(true)
  })
})

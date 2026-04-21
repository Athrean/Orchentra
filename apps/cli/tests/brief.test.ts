import { describe, expect, test } from 'bun:test'
import type { WorkflowJob, WorkflowRun } from '@orchentra/cli-api'
import { buildTriageBrief, shortSummary } from '../src/commands/brief'

const run: WorkflowRun = {
  id: 42,
  name: 'CI',
  head_branch: 'main',
  head_sha: 'abc1234def',
  event: 'push',
  status: 'completed',
  conclusion: 'failure',
  html_url: 'https://github.com/o/r/actions/runs/42',
  workflow_id: 1,
}

function job(name: string): WorkflowJob {
  return {
    id: Math.floor(Math.random() * 1000),
    run_id: 42,
    name,
    status: 'completed',
    conclusion: 'failure',
    html_url: `https://github.com/o/r/jobs/${name}`,
    steps: [{ name: 'run', status: 'completed', conclusion: 'failure', number: 1 }],
  }
}

describe('buildTriageBrief', () => {
  test('success when no failing jobs', () => {
    const brief = buildTriageBrief(run, [])
    expect(brief.conclusion).toBe('success')
    expect(brief.title).toContain('passed')
  })

  test('summarizes failing jobs with first error line', () => {
    const brief = buildTriageBrief(run, [{ job: job('test'), logs: '##[error] TypeError at x.ts:10' }])
    expect(brief.conclusion).toBe('failure')
    expect(brief.summary).toContain('TypeError')
    expect(brief.title).toContain('test')
  })

  test('handles missing error marker', () => {
    const brief = buildTriageBrief(run, [{ job: job('test'), logs: 'just some output' }])
    expect(brief.summary).toContain('failure')
  })
})

describe('shortSummary', () => {
  test('truncates at 140 chars', () => {
    const brief = buildTriageBrief(run, [{ job: job('a'), logs: `##[error] ${'x'.repeat(500)}` }])
    expect(shortSummary(brief).length).toBeLessThanOrEqual(140)
  })
})

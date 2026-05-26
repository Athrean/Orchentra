import { describe, expect, it } from 'bun:test'
import { mapRunDetail, type OctokitJob, type OctokitRunDetail } from '../lib/github/run-detail'

const baseRun: OctokitRunDetail = {
  id: 42,
  name: 'CI',
  status: 'completed',
  conclusion: 'failure',
  html_url: 'https://github.com/acme/app/actions/runs/42',
  created_at: '2026-05-20T10:00:00Z',
  updated_at: '2026-05-20T10:05:00Z',
  run_started_at: '2026-05-20T10:00:30Z',
  head_branch: 'main',
  head_sha: 'abc1234',
  event: 'push',
}

describe('mapRunDetail', () => {
  it('maps run metadata and jobs into the typed detail shape', () => {
    const jobs: OctokitJob[] = [
      {
        id: 100,
        name: 'build',
        status: 'completed',
        conclusion: 'success',
        html_url: 'https://github.com/acme/app/runs/100',
        steps: [],
      },
    ]

    const detail = mapRunDetail(baseRun, jobs, 'acme/app')

    expect(detail.id).toBe(42)
    expect(detail.name).toBe('CI')
    expect(detail.conclusion).toBe('failure')
    expect(detail.repoFullName).toBe('acme/app')
    expect(detail.headBranch).toBe('main')
    expect(detail.headSha).toBe('abc1234')
    expect(detail.event).toBe('push')
    expect(detail.htmlUrl).toBe('https://github.com/acme/app/actions/runs/42')
    expect(detail.jobs).toHaveLength(1)
    expect(detail.jobs[0].name).toBe('build')
  })

  it('maps each job step and flags failed jobs', () => {
    const jobs: OctokitJob[] = [
      {
        id: 100,
        name: 'build',
        status: 'completed',
        conclusion: 'success',
        html_url: 'https://github.com/acme/app/runs/100',
        steps: [{ name: 'checkout', number: 1, status: 'completed', conclusion: 'success' }],
      },
      {
        id: 101,
        name: 'test',
        status: 'completed',
        conclusion: 'failure',
        html_url: 'https://github.com/acme/app/runs/101',
        steps: [
          { name: 'install', number: 1, status: 'completed', conclusion: 'success' },
          { name: 'run tests', number: 2, status: 'completed', conclusion: 'failure' },
        ],
      },
    ]

    const detail = mapRunDetail(baseRun, jobs, 'acme/app')

    const build = detail.jobs.find((j) => j.name === 'build')!
    const test = detail.jobs.find((j) => j.name === 'test')!
    expect(build.failed).toBe(false)
    expect(build.steps).toHaveLength(1)
    expect(build.steps[0]).toEqual({ name: 'checkout', number: 1, status: 'completed', conclusion: 'success' })
    expect(test.failed).toBe(true)
    expect(test.steps).toHaveLength(2)
    expect(test.steps[1].conclusion).toBe('failure')
  })

  it('handles unnamed runs, missing steps, and null conclusions', () => {
    const run: OctokitRunDetail = { ...baseRun, name: null, conclusion: null }
    const jobs: OctokitJob[] = [{ id: 100, name: 'build', status: 'in_progress', conclusion: null, html_url: null }]

    const detail = mapRunDetail(run, jobs, 'acme/app')

    expect(detail.name).toBe('(unnamed)')
    expect(detail.conclusion).toBeNull()
    expect(detail.jobs[0].conclusion).toBeNull()
    expect(detail.jobs[0].failed).toBe(false)
    expect(detail.jobs[0].steps).toEqual([])
    expect(detail.jobs[0].htmlUrl).toBe('')
  })

  it('computes duration from run_started_at to updated_at, null when missing', () => {
    const detail = mapRunDetail(baseRun, [], 'acme/app')
    // 10:00:30 -> 10:05:00 = 270_000ms
    expect(detail.durationMs).toBe(270_000)

    const noStart = mapRunDetail({ ...baseRun, run_started_at: null }, [], 'acme/app')
    expect(noStart.durationMs).toBeNull()
  })

  it('orders failed jobs first, preserving order within each group', () => {
    const jobs: OctokitJob[] = [
      { id: 1, name: 'a-pass', status: 'completed', conclusion: 'success', html_url: null },
      { id: 2, name: 'b-fail', status: 'completed', conclusion: 'failure', html_url: null },
      { id: 3, name: 'c-pass', status: 'completed', conclusion: 'success', html_url: null },
      { id: 4, name: 'd-timeout', status: 'completed', conclusion: 'timed_out', html_url: null },
    ]
    const detail = mapRunDetail(baseRun, jobs, 'acme/app')
    expect(detail.jobs.map((j) => j.name)).toEqual(['b-fail', 'd-timeout', 'a-pass', 'c-pass'])
  })
})

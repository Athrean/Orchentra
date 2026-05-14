import { describe, expect, test } from 'bun:test'
import { runTriage } from '../src/commands/run-triage'
import type { TriageResult } from '../src/commands/triage'

function fakeTriageResult(): TriageResult {
  return {
    run: {
      id: 42,
      name: 'CI',
      head_branch: 'main',
      head_sha: 'sha-head',
      event: 'push',
      status: 'completed',
      conclusion: 'failure',
      html_url: '',
      workflow_id: 1,
    },
    failingJobs: [],
    brief: {
      title: 't',
      summary: 's',
      details: 'd',
      conclusion: 'failure',
    },
    status: {
      id: 1,
      state: 'failure',
      context: 'orchentra/triage',
      description: '',
      target_url: null,
    },
    check: {
      id: 500,
      status: 'completed',
      conclusion: 'failure',
      name: 'Orchentra Triage',
      external_id: 'orchentra-triage-42',
      head_sha: 'sha-head',
      html_url: '',
    },
    comment: null,
    pullRequest: null,
  }
}

describe('runTriage — next-step hint', () => {
  test('writes the muted /summarize hint on success', async () => {
    const captured: string[] = []
    const exit = await runTriage({
      spec: 'acme/api#42',
      model: 'm',
      permissionMode: 'workspace-write',
      cwd: '/tmp',
      // Test-only injection: stub the GitHub-side triage call so we can
      // assert what the success path writes to the caller's stdout.
      triageImpl: async () => fakeTriageResult(),
      write: (text: string) => {
        captured.push(text)
      },
    })
    expect(exit).toBe(0)
    const joined = captured.join('')
    expect(joined).toContain('Run /summarize 42 to extract root cause.')
  })

  test('does not write the hint when the run-spec is invalid', async () => {
    const captured: string[] = []
    const stderr: string[] = []
    const exit = await runTriage({
      spec: 'not-a-spec',
      model: 'm',
      permissionMode: 'workspace-write',
      cwd: '/tmp',
      triageImpl: async () => fakeTriageResult(),
      write: (text: string) => {
        captured.push(text)
      },
      writeError: (text: string) => {
        stderr.push(text)
      },
    })
    expect(exit).toBe(1)
    expect(captured.join('')).not.toContain('Run /summarize')
    expect(stderr.join('')).toMatch(/error:/)
  })

  test('does not write the hint when triage throws', async () => {
    const captured: string[] = []
    const stderr: string[] = []
    const exit = await runTriage({
      spec: 'acme/api#42',
      model: 'm',
      permissionMode: 'workspace-write',
      cwd: '/tmp',
      triageImpl: async () => {
        throw new Error('boom')
      },
      write: (text: string) => {
        captured.push(text)
      },
      writeError: (text: string) => {
        stderr.push(text)
      },
    })
    expect(exit).toBe(1)
    expect(captured.join('')).not.toContain('Run /summarize')
    expect(stderr.join('')).toContain('boom')
  })
})

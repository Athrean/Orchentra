#!/usr/bin/env bun
/**
 * Test fixture: boots the stdio MCP server with an in-memory fake GitHub
 * adapter so the subprocess round-trip test can exercise tools/list and
 * tools/call without hitting the real GitHub API.
 */
import { operations, setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '@orchentra/operations'
import { startStdioServer } from '../../src'

const fake: GithubAdapter = {
  pulls: {
    get: async () => ({
      data: {
        title: 'Fake PR',
        body: 'fake',
        state: 'open',
        merged: false,
        user: { login: 'tester' },
        base: { ref: 'main' },
        head: { ref: 'feature' },
        created_at: '2026-04-01T10:00:00Z',
      },
    }),
    listFiles: async () => ({ data: [] }),
    listReviewComments: async () => ({ data: [] }),
  },
  issues: {
    get: async () => ({
      data: {
        title: 'Fake Issue',
        body: 'fake',
        state: 'open',
        labels: [],
        user: { login: 'tester' },
        created_at: '2026-04-01T10:00:00Z',
      },
    }),
    listComments: async () => ({ data: [] }),
  },
  repos: {
    getCommit: async () => ({
      data: {
        sha: 'abc1234',
        commit: { message: 'fake', author: { name: 'tester' } },
        files: [{ filename: 'a.ts', status: 'modified', additions: 1, deletions: 0 }],
      },
    }),
    getContent: async () => ({
      data: {
        type: 'file',
        path: 'a.ts',
        content: Buffer.from('hello world').toString('base64'),
        size: 11,
      },
    }),
  },
  search: {
    code: async () => ({
      data: {
        total_count: 1,
        items: [{ path: 'src/foo.ts', name: 'foo.ts' }],
      },
    }),
  },
  actions: {
    listWorkflowRunsForRepo: async () => ({ data: { total_count: 0, workflow_runs: [] } }),
    getWorkflowRun: async ({ run_id }) => ({
      data: {
        id: run_id,
        name: 'Fake Workflow',
        head_branch: 'main',
        head_sha: 'abc1234',
        status: 'completed',
        conclusion: 'success',
        run_attempt: 1,
        html_url: `https://github.com/fake/fake/actions/runs/${run_id}`,
        created_at: '2026-04-01T10:00:00Z',
        updated_at: '2026-04-01T10:05:00Z',
        jobs_url: `https://api.github.com/repos/fake/fake/actions/runs/${run_id}/jobs`,
        logs_url: `https://api.github.com/repos/fake/fake/actions/runs/${run_id}/logs`,
      },
    }),
    listJobsForWorkflowRun: async () => ({ data: { total_count: 0, jobs: [] } }),
    downloadJobLogsForWorkflowRun: async () => ({ data: 'fake job logs' }),
  },
}

setGithubAdapter(fake)
setRepoMonitoredCheck(async () => true)

await startStdioServer(operations)

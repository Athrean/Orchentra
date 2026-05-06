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
    list: async () => ({ data: [] }),
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
    list: async () => ({ data: [] }),
    listComments: async () => ({ data: [] }),
  },
  repos: {
    get: async () => ({
      data: {
        name: 'api',
        full_name: 'my-org/api',
        default_branch: 'main',
        language: 'TypeScript',
        topics: [],
        private: true,
        archived: false,
        pushed_at: '2026-04-01T10:00:00Z',
        size: 1024,
        stargazers_count: 10,
        open_issues_count: 2,
      },
    }),
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
    listBranches: async () => ({ data: [] }),
    listLanguages: async () => ({ data: { TypeScript: 1000 } }),
    getAllTopics: async () => ({ data: { names: [] } }),
  },
  checks: {
    listForRef: async () => ({ data: { total_count: 0, check_runs: [] } }),
  },
  actions: {
    listWorkflowRunArtifacts: async () => ({ data: { total_count: 0, artifacts: [] } }),
    downloadArtifact: async () => ({ data: new ArrayBuffer(0) }),
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
    listWorkflowRunArtifacts: async () => ({ data: { total_count: 0, artifacts: [] } }),
    downloadArtifact: async () => ({ data: new ArrayBuffer(0) }),
    // Slice 7 — mutating Actions ops. Stubbed no-ops; the stdio integration
    // test only verifies tools/list contains them. Per-op behavior is covered
    // in their dedicated unit tests.
    reRunWorkflow: async () => undefined,
    reRunWorkflowFailedJobs: async () => undefined,
    cancelWorkflowRun: async () => undefined,
    createWorkflowDispatch: async () => undefined,
  },
}

setGithubAdapter(fake)
setRepoMonitoredCheck(async () => true)

await startStdioServer(operations)

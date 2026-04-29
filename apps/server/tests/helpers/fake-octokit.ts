/**
 * Minimal Octokit-shaped HTTP client used by tests in place of @octokit/rest.
 * Routes calls to a local fake-github server via fetch. Avoids importing
 * @octokit/rest so cross-file mock.module('@octokit/rest') leakage is moot.
 */

interface FetchOpts {
  method?: string
  body?: unknown
  query?: Record<string, string | number | undefined>
}

export interface FakeOctokit {
  actions: {
    listJobsForWorkflowRun: (p: { owner: string; repo: string; run_id: number }) => Promise<{ data: unknown }>
    downloadJobLogsForWorkflowRun: (p: { owner: string; repo: string; job_id: number }) => Promise<{ data: string }>
    reRunWorkflowFailedJobs: (p: { owner: string; repo: string; run_id: number }) => Promise<{ status: number }>
    listWorkflowRuns: (p: {
      owner: string
      repo: string
      per_page?: number
      page?: number
    }) => Promise<{ data: unknown }>
    cancelWorkflowRun: (p: { owner: string; repo: string; run_id: number }) => Promise<{ status: number }>
    listRepoWorkflows: (p: { owner: string; repo: string }) => Promise<{ data: unknown }>
    listWorkflowRunsForRepo: (p: {
      owner: string
      repo: string
      per_page?: number
      page?: number
    }) => Promise<{ data: unknown }>
    createWorkflowDispatch: (p: {
      owner: string
      repo: string
      workflow_id: string | number
      ref: string
      inputs?: Record<string, string>
    }) => Promise<{ status: number }>
  }
  pulls: {
    get: (p: { owner: string; repo: string; pull_number: number }) => Promise<{ data: unknown }>
    listFiles: (p: {
      owner: string
      repo: string
      pull_number: number
      per_page?: number
    }) => Promise<{ data: unknown[] }>
    listReviewComments: (p: {
      owner: string
      repo: string
      pull_number: number
      per_page?: number
    }) => Promise<{ data: unknown[] }>
    create: (p: {
      owner: string
      repo: string
      title: string
      head: string
      base: string
      body?: string
      draft?: boolean
    }) => Promise<{ data: unknown }>
  }
  issues: {
    get: (p: { owner: string; repo: string; issue_number: number }) => Promise<{ data: unknown }>
    listComments: (p: {
      owner: string
      repo: string
      issue_number: number
      per_page?: number
    }) => Promise<{ data: unknown[] }>
    createComment: (p: {
      owner: string
      repo: string
      issue_number: number
      body: string
    }) => Promise<{ data: unknown }>
    updateComment: (p: { owner: string; repo: string; comment_id: number; body: string }) => Promise<{ data: unknown }>
    create: (p: {
      owner: string
      repo: string
      title: string
      body?: string
      labels?: string[]
    }) => Promise<{ data: unknown }>
  }
  repos: {
    getCommit: (p: { owner: string; repo: string; ref: string }) => Promise<{ data: unknown }>
    getContent: (p: { owner: string; repo: string; path: string; ref?: string }) => Promise<{ data: unknown }>
    createCommitStatus: (p: {
      owner: string
      repo: string
      sha: string
      state: string
      description?: string
      context?: string
      target_url?: string
    }) => Promise<{ data: unknown }>
    listPullRequestsAssociatedWithCommit: (p: {
      owner: string
      repo: string
      commit_sha: string
    }) => Promise<{ data: unknown[] }>
  }
  search: {
    code: (p: { q: string; per_page?: number }) => Promise<{ data: unknown }>
  }
  checks: {
    create: (p: {
      owner: string
      repo: string
      name: string
      head_sha: string
      status: string
      output?: unknown
    }) => Promise<{ data: { id: number } }>
    update: (p: {
      owner: string
      repo: string
      check_run_id: number
      status?: string
      conclusion?: string
      output?: unknown
    }) => Promise<{ data: { id: number } }>
  }
  git: {
    getRef: (p: { owner: string; repo: string; ref: string }) => Promise<{ data: unknown }>
    createRef: (p: { owner: string; repo: string; ref: string; sha: string }) => Promise<{ data: unknown }>
    updateRef: (p: {
      owner: string
      repo: string
      ref: string
      sha: string
      force?: boolean
    }) => Promise<{ data: unknown }>
    getCommit: (p: { owner: string; repo: string; commit_sha: string }) => Promise<{ data: unknown }>
    createCommit: (p: {
      owner: string
      repo: string
      message: string
      tree: string
      parents: string[]
      author?: { name: string; email: string; date?: string }
    }) => Promise<{ data: unknown }>
    createBlob: (p: { owner: string; repo: string; content: string; encoding?: string }) => Promise<{ data: unknown }>
    createTree: (p: {
      owner: string
      repo: string
      base_tree?: string
      tree: Array<Record<string, unknown>>
    }) => Promise<{ data: unknown }>
  }
  paginate: {
    iterator: (fn: unknown, opts: Record<string, unknown>) => AsyncIterable<{ data: unknown[] }>
  }
}

export function makeFakeOctokit(baseUrl: string): FakeOctokit {
  const call = async (
    path: string,
    { method = 'GET', body, query }: FetchOpts = {},
  ): Promise<{ status: number; data: unknown }> => {
    const url = new URL(`${baseUrl}${path}`)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
      }
    }
    const init: RequestInit = { method }
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' }
      init.body = JSON.stringify(body)
    }
    const r = await fetch(url, init)
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} ${r.statusText} at ${method} ${path}`)
    }
    const ct = r.headers.get('content-type') ?? ''
    const data = ct.includes('application/json') ? await r.json() : await r.text()
    return { status: r.status, data }
  }

  return {
    actions: {
      listJobsForWorkflowRun: ({ owner, repo, run_id }) =>
        call(`/repos/${owner}/${repo}/actions/runs/${run_id}/jobs`).then((r) => ({ data: r.data })),
      downloadJobLogsForWorkflowRun: ({ owner, repo, job_id }) =>
        call(`/repos/${owner}/${repo}/actions/jobs/${job_id}/logs`).then((r) => ({ data: r.data as string })),
      reRunWorkflowFailedJobs: ({ owner, repo, run_id }) =>
        call(`/repos/${owner}/${repo}/actions/runs/${run_id}/rerun-failed-jobs`, { method: 'POST' }).then((r) => ({
          status: r.status,
        })),
      listWorkflowRuns: ({ owner, repo, per_page, page }) =>
        call(`/repos/${owner}/${repo}/actions/runs`, { query: { per_page, page } }).then((r) => ({ data: r.data })),
      cancelWorkflowRun: ({ owner, repo, run_id }) =>
        call(`/repos/${owner}/${repo}/actions/runs/${run_id}/cancel`, { method: 'POST' }).then((r) => ({
          status: r.status,
        })),
      listRepoWorkflows: ({ owner, repo }) =>
        call(`/repos/${owner}/${repo}/actions/workflows`).then((r) => ({ data: r.data })),
      listWorkflowRunsForRepo: ({ owner, repo, per_page, page }) =>
        call(`/repos/${owner}/${repo}/actions/runs`, { query: { per_page, page } }).then((r) => ({ data: r.data })),
      createWorkflowDispatch: ({ owner, repo, workflow_id, ref, inputs }) =>
        call(`/repos/${owner}/${repo}/actions/workflows/${workflow_id}/dispatches`, {
          method: 'POST',
          body: { ref, inputs },
        }).then((r) => ({ status: r.status })),
    },
    pulls: {
      get: ({ owner, repo, pull_number }) =>
        call(`/repos/${owner}/${repo}/pulls/${pull_number}`).then((r) => ({ data: r.data })),
      listFiles: ({ owner, repo, pull_number, per_page }) =>
        call(`/repos/${owner}/${repo}/pulls/${pull_number}/files`, { query: { per_page } }).then((r) => ({
          data: r.data as unknown[],
        })),
      listReviewComments: ({ owner, repo, pull_number, per_page }) =>
        call(`/repos/${owner}/${repo}/pulls/${pull_number}/comments`, { query: { per_page } }).then((r) => ({
          data: r.data as unknown[],
        })),
      create: ({ owner, repo, title, head, base, body, draft }) =>
        call(`/repos/${owner}/${repo}/pulls`, {
          method: 'POST',
          body: { title, head, base, body, draft },
        }).then((r) => ({ data: r.data })),
    },
    issues: {
      get: ({ owner, repo, issue_number }) =>
        call(`/repos/${owner}/${repo}/issues/${issue_number}`).then((r) => ({ data: r.data })),
      listComments: ({ owner, repo, issue_number, per_page }) =>
        call(`/repos/${owner}/${repo}/issues/${issue_number}/comments`, { query: { per_page } }).then((r) => ({
          data: r.data as unknown[],
        })),
      createComment: ({ owner, repo, issue_number, body }) =>
        call(`/repos/${owner}/${repo}/issues/${issue_number}/comments`, { method: 'POST', body: { body } }).then(
          (r) => ({
            data: r.data,
          }),
        ),
      updateComment: ({ owner, repo, comment_id, body }) =>
        call(`/repos/${owner}/${repo}/issues/comments/${comment_id}`, { method: 'PATCH', body: { body } }).then(
          (r) => ({
            data: r.data,
          }),
        ),
      create: ({ owner, repo, title, body, labels }) =>
        call(`/repos/${owner}/${repo}/issues`, { method: 'POST', body: { title, body, labels } }).then((r) => ({
          data: r.data,
        })),
    },
    repos: {
      getCommit: ({ owner, repo, ref }) =>
        call(`/repos/${owner}/${repo}/commits/${ref}`).then((r) => ({ data: r.data })),
      getContent: ({ owner, repo, path, ref }) =>
        call(`/repos/${owner}/${repo}/contents/${path}`, { query: { ref } }).then((r) => ({ data: r.data })),
      createCommitStatus: ({ owner, repo, sha, state, description, context, target_url }) =>
        call(`/repos/${owner}/${repo}/statuses/${sha}`, {
          method: 'POST',
          body: { state, description, context, target_url },
        }).then((r) => ({ data: r.data })),
      listPullRequestsAssociatedWithCommit: ({ owner, repo, commit_sha }) =>
        call(`/repos/${owner}/${repo}/commits/${commit_sha}/pulls`).then((r) => ({ data: r.data as unknown[] })),
    },
    search: {
      code: ({ q, per_page }) => call(`/search/code`, { query: { q, per_page } }).then((r) => ({ data: r.data })),
    },
    checks: {
      create: ({ owner, repo, name, head_sha, status, output }) =>
        call(`/repos/${owner}/${repo}/check-runs`, {
          method: 'POST',
          body: { name, head_sha, status, output },
        }).then((r) => ({ data: r.data as { id: number } })),
      update: ({ owner, repo, check_run_id, status, conclusion, output }) =>
        call(`/repos/${owner}/${repo}/check-runs/${check_run_id}`, {
          method: 'PATCH',
          body: { status, conclusion, output },
        }).then((r) => ({ data: r.data as { id: number } })),
    },
    git: {
      getRef: ({ owner, repo, ref }) => call(`/repos/${owner}/${repo}/git/ref/${ref}`).then((r) => ({ data: r.data })),
      createRef: ({ owner, repo, ref, sha }) =>
        call(`/repos/${owner}/${repo}/git/refs`, { method: 'POST', body: { ref, sha } }).then((r) => ({
          data: r.data,
        })),
      updateRef: ({ owner, repo, ref, sha, force }) =>
        call(`/repos/${owner}/${repo}/git/refs/${ref}`, {
          method: 'PATCH',
          body: { sha, force },
        }).then((r) => ({ data: r.data })),
      getCommit: ({ owner, repo, commit_sha }) =>
        call(`/repos/${owner}/${repo}/git/commits/${commit_sha}`).then((r) => ({ data: r.data })),
      createCommit: ({ owner, repo, message, tree, parents, author }) =>
        call(`/repos/${owner}/${repo}/git/commits`, {
          method: 'POST',
          body: { message, tree, parents, author },
        }).then((r) => ({ data: r.data })),
      createBlob: ({ owner, repo, content, encoding }) =>
        call(`/repos/${owner}/${repo}/git/blobs`, {
          method: 'POST',
          body: { content, encoding },
        }).then((r) => ({ data: r.data })),
      createTree: ({ owner, repo, base_tree, tree }) =>
        call(`/repos/${owner}/${repo}/git/trees`, {
          method: 'POST',
          body: { base_tree, tree },
        }).then((r) => ({ data: r.data })),
    },
    paginate: {
      iterator: (_fn, _opts) => {
        return (async function* () {
          yield { data: [] }
        })()
      },
    },
  }
}

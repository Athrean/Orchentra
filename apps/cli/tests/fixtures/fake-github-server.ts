import type { Server } from 'bun'

export interface FakeJob {
  id: number
  name: string
  conclusion: 'success' | 'failure' | 'skipped' | 'cancelled' | null
  steps?: Array<{ name: string; conclusion: 'success' | 'failure' | 'skipped' | null }>
  started_at?: string | null
  completed_at?: string | null
}

export interface FakePull {
  title: string
  body: string | null
  state: string
  merged: boolean
  user?: { login?: string } | null
  base: { ref: string }
  head: { ref: string }
  created_at: string
}

export interface FakePullFile {
  filename: string
  status: string
  additions: number
  deletions: number
}

export interface FakeIssue {
  title: string
  body: string | null
  state: string
  labels?: Array<string | { name?: string | null }>
  user?: { login?: string } | null
  created_at: string
}

export interface FakeComment {
  user?: { login?: string } | null
  body?: string | null
}

export interface FakeCommitFile {
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string
}

export interface FakeCommit {
  sha: string
  commit: { message: string; author?: { name?: string | null } | null }
  files?: FakeCommitFile[]
}

export interface FakeContent {
  type: 'file' | 'dir' | string
  path: string
  content?: string
  size?: number
  encoding?: string
}

export interface FakeCodeSearch {
  total_count: number
  items: Array<{ path: string; name: string }>
}

export interface FakeScenario {
  jobs?: FakeJob[]
  logsByJobId?: Record<number, string>
  pulls?: Record<string, FakePull>
  pullFiles?: Record<string, FakePullFile[]>
  pullReviewComments?: Record<string, FakeComment[]>
  issues?: Record<string, FakeIssue>
  issueComments?: Record<string, FakeComment[]>
  commits?: Record<string, FakeCommit>
  contents?: Record<string, FakeContent>
  codeSearch?: FakeCodeSearch
}

export interface FakeGitHubHandle {
  baseUrl: string
  setScenario: (s: FakeScenario) => void
  shutdown: () => Promise<void>
}

/**
 * Tiny fake GitHub server kept inside the CLI test boundary so the subprocess
 * test does not reach across packages. Implements the routes both adapters
 * surface (Actions for get_workflow_logs + REST read ops for the lowercase
 * GithubAdapter that powers get_pull_request, get_issue, get_commit_changes,
 * get_file_content, search_code).
 */
export async function spawnFakeGitHubForMcpTest(): Promise<FakeGitHubHandle> {
  let scenario: FakeScenario = {}

  const server: Server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (req) => {
      const url = new URL(req.url)
      const jobsMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)\/jobs$/)
      if (jobsMatch) {
        return Response.json({ total_count: scenario.jobs?.length ?? 0, jobs: scenario.jobs ?? [] })
      }
      const logsMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/actions\/jobs\/(\d+)\/logs$/)
      if (logsMatch) {
        const jobId = Number(logsMatch[3])
        const text = scenario.logsByJobId?.[jobId] ?? ''
        return new Response(text, { status: 200, headers: { 'content-type': 'text/plain' } })
      }

      // PR review comments must be matched before /pulls/N because both share
      // the /pulls/N prefix and the longer path would otherwise be shadowed.
      const prCommentsMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/comments$/)
      if (prCommentsMatch) {
        const key = `${prCommentsMatch[1]}/${prCommentsMatch[2]}#${prCommentsMatch[3]}`
        return Response.json(scenario.pullReviewComments?.[key] ?? [])
      }
      const prFilesMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/files$/)
      if (prFilesMatch) {
        const key = `${prFilesMatch[1]}/${prFilesMatch[2]}#${prFilesMatch[3]}`
        return Response.json(scenario.pullFiles?.[key] ?? [])
      }
      const prMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/)
      if (prMatch) {
        const key = `${prMatch[1]}/${prMatch[2]}#${prMatch[3]}`
        const pr = scenario.pulls?.[key]
        if (!pr) return Response.json({ message: 'not found' }, { status: 404 })
        return Response.json(pr)
      }

      const issueCommentsMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/)
      if (issueCommentsMatch) {
        const key = `${issueCommentsMatch[1]}/${issueCommentsMatch[2]}#${issueCommentsMatch[3]}`
        return Response.json(scenario.issueComments?.[key] ?? [])
      }
      const issueMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)$/)
      if (issueMatch) {
        const key = `${issueMatch[1]}/${issueMatch[2]}#${issueMatch[3]}`
        const issue = scenario.issues?.[key]
        if (!issue) return Response.json({ message: 'not found' }, { status: 404 })
        return Response.json(issue)
      }

      const commitMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/commits\/([^/]+)$/)
      if (commitMatch) {
        const key = `${commitMatch[1]}/${commitMatch[2]}#${commitMatch[3]}`
        const commit = scenario.commits?.[key]
        if (!commit) return Response.json({ message: 'not found' }, { status: 404 })
        return Response.json(commit)
      }

      const contentMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/)
      if (contentMatch) {
        const key = `${contentMatch[1]}/${contentMatch[2]}#${decodeURIComponent(contentMatch[3])}`
        const content = scenario.contents?.[key]
        if (!content) return Response.json({ message: 'not found' }, { status: 404 })
        return Response.json(content)
      }

      if (url.pathname === '/search/code') {
        return Response.json(scenario.codeSearch ?? { total_count: 0, items: [] })
      }

      return Response.json({ message: 'fake-github: route not stubbed' }, { status: 404 })
    },
  })

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    setScenario: (s) => {
      scenario = s
    },
    shutdown: async () => {
      server.stop(true)
    },
  }
}

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { GitHubClient, GitHubApiError } from '../src/github/client'

// Mock getGitHubToken so we don't need real credentials
mock.module('../src/github/auth', () => ({
  getGitHubToken: async () => 'test-token-123',
}))

const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const respHeaders = new Headers(headers)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: respHeaders,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}

describe('GitHubClient', () => {
  let client: GitHubClient
  let fetchCalls: Array<{ url: string; method: string; body: unknown; headers: Record<string, string> }>

  beforeEach(() => {
    client = new GitHubClient()
    fetchCalls = []
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function trackFetch(responses: Array<{ body: unknown; status?: number; headers?: Record<string, string> }>): void {
    let callIndex = 0
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = (init?.method ?? 'GET').toUpperCase()
      let parsedBody: unknown = undefined
      if (init?.body) {
        try {
          parsedBody = JSON.parse(init.body as string)
        } catch {
          parsedBody = init.body
        }
      }
      const headerObj: Record<string, string> = {}
      if (init?.headers) {
        const h = init.headers as Record<string, string>
        for (const [k, v] of Object.entries(h)) {
          headerObj[k] = v
        }
      }
      fetchCalls.push({ url: urlStr, method, body: parsedBody, headers: headerObj })

      const response = responses[callIndex++] ?? responses[responses.length - 1]
      return jsonResponse(response.body, response.status, response.headers)
    }) as typeof globalThis.fetch
  }

  describe('getWorkflowRun', () => {
    test('returns parsed workflow run', async () => {
      // given: API returns a valid workflow run object
      const run = {
        id: 42,
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
        head_sha: 'abc123',
        head_branch: 'main',
        event: 'push',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:05:00Z',
        html_url: 'https://github.com/o/r/actions/runs/42',
        repository: { full_name: 'o/r' },
      }
      trackFetch([{ body: run }])

      // when
      const result = await client.getWorkflowRun('o', 'r', 42)

      // then
      expect(result.id).toBe(42)
      expect(result.name).toBe('CI')
      expect(result.conclusion).toBe('success')
      expect(fetchCalls.length).toBe(1)
      expect(fetchCalls[0].url).toContain('/repos/o/r/actions/runs/42')
    })

    test('throws GitHubApiError on non-ok response', async () => {
      // given: API returns 404
      trackFetch([{ body: { message: 'Not Found' }, status: 404 }])

      // when & then
      try {
        await client.getWorkflowRun('o', 'r', 999)
        expect.unreachable('Should have thrown')
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(GitHubApiError)
        expect((err as GitHubApiError).status).toBe(404)
      }
    })
  })

  describe('getWorkflowJobs', () => {
    test('returns array of jobs', async () => {
      // given: API returns jobs envelope
      const jobs = [
        {
          id: 1,
          name: 'build',
          status: 'completed',
          conclusion: 'success',
          started_at: '',
          completed_at: '',
          steps: [],
        },
        {
          id: 2,
          name: 'test',
          status: 'completed',
          conclusion: 'failure',
          started_at: '',
          completed_at: '',
          steps: [],
        },
      ]
      trackFetch([{ body: { jobs } }])

      // when
      const result = await client.getWorkflowJobs('o', 'r', 42)

      // then
      expect(result.length).toBe(2)
      expect(result[0].name).toBe('build')
      expect(result[1].conclusion).toBe('failure')
    })

    test('unwraps { jobs: [...] } envelope', async () => {
      // given: API returns jobs inside an envelope
      trackFetch([
        {
          body: {
            jobs: [
              {
                id: 10,
                name: 'deploy',
                status: 'in_progress',
                conclusion: null,
                started_at: '',
                completed_at: '',
                steps: [],
              },
            ],
          },
        },
      ])

      // when
      const result = await client.getWorkflowJobs('o', 'r', 42)

      // then
      expect(result.length).toBe(1)
      expect(result[0].id).toBe(10)
    })
  })

  describe('getJobLog', () => {
    test('returns log text for successful response', async () => {
      // given: API returns log text directly
      trackFetch([{ body: 'line 1\nline 2\nline 3' }])

      // when
      const result = await client.getJobLog('o', 'r', 10)

      // then
      expect(result).toBe('line 1\nline 2\nline 3')
    })

    test('follows redirect for 302 response', async () => {
      // given: first call returns 302, redirect returns log text
      let callIndex = 0
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        callIndex++
        const urlStr = typeof url === 'string' ? url : url.toString()
        fetchCalls.push({ url: urlStr, method: init?.method ?? 'GET', body: undefined, headers: {} })

        if (callIndex === 1) {
          return {
            ok: false,
            status: 302,
            headers: new Headers({ location: 'https://logs.example.com/job-10.log' }),
            text: async () => '',
          } as unknown as Response
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => 'redirected-log-content',
        } as unknown as Response
      }) as typeof globalThis.fetch

      // when
      const result = await client.getJobLog('o', 'r', 10)

      // then
      expect(result).toBe('redirected-log-content')
      expect(fetchCalls.length).toBe(2)
      expect(fetchCalls[1].url).toBe('https://logs.example.com/job-10.log')
    })

    test('handles redirect without location header gracefully', async () => {
      // given: 302 with no location header
      globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url.toString()
        fetchCalls.push({ url: urlStr, method: 'GET', body: undefined, headers: {} })
        return {
          ok: false,
          status: 302,
          headers: new Headers(), // no location
          text: async () => 'some-body',
        } as unknown as Response
      }) as typeof globalThis.fetch

      // when
      const result = await client.getJobLog('o', 'r', 10)

      // then: falls through to return text body
      expect(result).toBe('some-body')
    })
  })

  describe('createCheckRun', () => {
    test('sends POST with correct body', async () => {
      // given: API accepts check run creation
      trackFetch([
        {
          body: {
            id: 99,
            name: 'triage',
            status: 'completed',
            conclusion: 'success',
            output: { title: 'T', summary: 'S' },
          },
        },
      ])

      // when
      const result = await client.createCheckRun('o', 'r', 'sha123', {
        name: 'triage',
        status: 'completed',
        conclusion: 'success',
        output: { title: 'T', summary: 'S' },
      })

      // then
      expect(result.id).toBe(99)
      expect(fetchCalls[0].method).toBe('POST')
      expect(fetchCalls[0].url).toContain('/repos/o/r/check-runs')
      const body = fetchCalls[0].body as Record<string, unknown>
      expect(body.head_sha).toBe('sha123')
      expect(body.name).toBe('triage')
    })
  })

  describe('listPullRequests', () => {
    test('sends query params correctly', async () => {
      // given: API returns PR list
      trackFetch([{ body: [] }])

      // when
      await client.listPullRequests('o', 'r', 'feature', 'main', 'open')

      // then
      const url = fetchCalls[0].url
      expect(url).toContain('state=open')
      expect(url).toContain('head=feature')
      expect(url).toContain('base=main')
    })
  })

  describe('createPullRequest', () => {
    test('sends POST with correct body', async () => {
      // given: API accepts PR creation
      trackFetch([
        {
          body: {
            number: 7,
            title: 'Fix bug',
            body: 'desc',
            state: 'open',
            head: { ref: 'fix', sha: 'abc' },
            base: { ref: 'main', sha: 'def' },
            html_url: 'https://github.com/o/r/pull/7',
          },
        },
      ])

      // when
      const result = await client.createPullRequest('o', 'r', {
        title: 'Fix bug',
        body: 'desc',
        head: 'fix',
        base: 'main',
      })

      // then
      expect(result.number).toBe(7)
      expect(fetchCalls[0].method).toBe('POST')
      const body = fetchCalls[0].body as Record<string, unknown>
      expect(body.title).toBe('Fix bug')
      expect(body.head).toBe('fix')
    })
  })

  describe('createIssueComment', () => {
    test('sends POST', async () => {
      // given: API accepts comment creation
      trackFetch([{ body: { id: 100 } }])

      // when
      await client.createIssueComment('o', 'r', 42, 'Nice PR!')

      // then
      expect(fetchCalls[0].method).toBe('POST')
      expect(fetchCalls[0].url).toContain('/repos/o/r/issues/42/comments')
      const body = fetchCalls[0].body as Record<string, unknown>
      expect(body.body).toBe('Nice PR!')
    })
  })

  describe('findExistingPr', () => {
    test('returns matching PR by title hash', async () => {
      // given: a PR with the matching orchentra:id marker exists
      // First fetch: listPullRequests, need to compute the hash
      const { createHash } = await import('node:crypto')
      const titleHash = createHash('sha256').update('Fix: CI pipeline').digest('hex').slice(0, 12)
      const prBody = `Description\n\n---\n[orchentra:id:${titleHash}]`

      trackFetch([
        {
          body: [
            {
              number: 5,
              title: 'Fix: CI pipeline',
              body: prBody,
              state: 'open',
              head: { ref: 'fix-ci', sha: 'abc' },
              base: { ref: 'main', sha: 'def' },
              html_url: 'https://github.com/o/r/pull/5',
            },
          ],
        },
      ])

      // when
      const result = await client.findExistingPr('o', 'r', 'fix-ci', 'main', 'Fix: CI pipeline')

      // then
      expect(result).not.toBeNull()
      expect(result!.number).toBe(5)
    })

    test('returns null when no match', async () => {
      // given: no PRs with matching title hash
      trackFetch([
        {
          body: [
            {
              number: 5,
              title: 'Other PR',
              body: 'no marker here',
              state: 'open',
              head: { ref: 'fix-ci', sha: 'abc' },
              base: { ref: 'main', sha: 'def' },
              html_url: 'https://github.com/o/r/pull/5',
            },
          ],
        },
      ])

      // when
      const result = await client.findExistingPr('o', 'r', 'fix-ci', 'main', 'Fix: CI pipeline')

      // then
      expect(result).toBeNull()
    })
  })

  describe('createIdempotentPr', () => {
    test('creates new PR when none exists', async () => {
      // given: no existing PR, then API creates one
      const newPr = {
        number: 10,
        title: 'Fix: deploy',
        body: 'fix content\n\n---\n[orchentra:id:somehash]',
        state: 'open',
        head: { ref: 'fix-deploy', sha: 'abc' },
        base: { ref: 'main', sha: 'def' },
        html_url: 'https://github.com/o/r/pull/10',
      }
      // First call: listPullRequests returns empty
      // Second call: createPullRequest returns new PR
      let callIndex = 0
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        callIndex++
        const urlStr = typeof url === 'string' ? url : url.toString()
        const method = (init?.method ?? 'GET').toUpperCase()
        let parsedBody: unknown = undefined
        if (init?.body) {
          try {
            parsedBody = JSON.parse(init.body as string)
          } catch {
            parsedBody = init.body
          }
        }
        fetchCalls.push({ url: urlStr, method, body: parsedBody, headers: {} })

        if (callIndex === 1) {
          return jsonResponse([]) // no existing PRs
        }
        return jsonResponse(newPr) // created PR
      }) as typeof globalThis.fetch

      // when
      const result = await client.createIdempotentPr('o', 'r', {
        title: 'Fix: deploy',
        body: 'fix content',
        head: 'fix-deploy',
        base: 'main',
      })

      // then
      expect(result.number).toBe(10)
      expect(fetchCalls.length).toBe(2)
      expect(fetchCalls[1].method).toBe('POST')
    })

    test('returns existing PR when match found', async () => {
      // given: existing PR with matching hash
      const { createHash } = await import('node:crypto')
      const titleHash = createHash('sha256').update('Fix: deploy').digest('hex').slice(0, 12)
      const existingPr = {
        number: 8,
        title: 'Fix: deploy',
        body: `fix content\n\n---\n[orchentra:id:${titleHash}]`,
        state: 'open',
        head: { ref: 'fix-deploy', sha: 'abc' },
        base: { ref: 'main', sha: 'def' },
        html_url: 'https://github.com/o/r/pull/8',
      }

      trackFetch([{ body: [existingPr] }])

      // when
      const result = await client.createIdempotentPr('o', 'r', {
        title: 'Fix: deploy',
        body: 'fix content',
        head: 'fix-deploy',
        base: 'main',
      })

      // then
      expect(result.number).toBe(8)
      // Only one fetch call (listPullRequests), no create call
      expect(fetchCalls.length).toBe(1)
    })

    test('appends marker to PR body', async () => {
      // given: no existing PR
      let callIndex = 0
      let capturedBody: unknown = null
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        callIndex++
        const urlStr = typeof url === 'string' ? url : url.toString()
        const method = (init?.method ?? 'GET').toUpperCase()
        let parsedBody: unknown = undefined
        if (init?.body) {
          try {
            parsedBody = JSON.parse(init.body as string)
          } catch {
            parsedBody = init.body
          }
        }
        if (callIndex === 2 && parsedBody) {
          capturedBody = parsedBody
        }
        fetchCalls.push({ url: urlStr, method, body: parsedBody, headers: {} })

        if (callIndex === 1) {
          return jsonResponse([])
        }
        return jsonResponse({
          number: 11,
          title: 'Fix: marker',
          body: 'some body\n\n---\n[orchentra:id:somehash]',
          state: 'open',
          head: { ref: 'fix-marker', sha: 'abc' },
          base: { ref: 'main', sha: 'def' },
          html_url: 'https://github.com/o/r/pull/11',
        })
      }) as typeof globalThis.fetch

      // when
      await client.createIdempotentPr('o', 'r', {
        title: 'Fix: marker',
        body: 'some body',
        head: 'fix-marker',
        base: 'main',
      })

      // then: body should contain the orchentra:id marker
      expect(capturedBody).not.toBeNull()
      const bodyStr = (capturedBody as Record<string, unknown>).body as string
      expect(bodyStr).toContain('[orchentra:id:')
      expect(bodyStr).toContain('some body')
    })
  })

  describe('createCommitStatus', () => {
    test('sends POST with correct params', async () => {
      // given: API accepts status creation
      trackFetch([{ body: {} }])

      // when
      await client.createCommitStatus('o', 'r', 'sha456', {
        state: 'success',
        targetUrl: 'https://example.com',
        description: 'All checks passed',
        context: 'ci/test',
      })

      // then
      expect(fetchCalls[0].method).toBe('POST')
      expect(fetchCalls[0].url).toContain('/repos/o/r/statuses/sha456')
      const body = fetchCalls[0].body as Record<string, unknown>
      expect(body.state).toBe('success')
      expect(body.targetUrl).toBe('https://example.com')
      expect(body.description).toBe('All checks passed')
      expect(body.context).toBe('ci/test')
    })
  })

  describe('rate limiting', () => {
    test('waits when remaining=0 then retries', async () => {
      // given: first response is 403 with remaining=0, then success
      let callIndex = 0
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        callIndex++
        const urlStr = typeof url === 'string' ? url : url.toString()
        const method = (init?.method ?? 'GET').toUpperCase()
        fetchCalls.push({ url: urlStr, method, body: undefined, headers: {} })

        if (callIndex === 1) {
          return jsonResponse({ message: 'rate limit exceeded' }, 403, {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1),
          })
        }
        return jsonResponse({ id: 42, name: 'CI', status: 'completed', conclusion: 'success' })
      }) as typeof globalThis.fetch

      // when
      const result = await client.getWorkflowRun('o', 'r', 42)

      // then: should have retried and succeeded
      expect(result.id).toBe(42)
      expect(callIndex).toBe(2)
    })

    test('parses x-ratelimit-remaining header', async () => {
      // given: response includes rate limit headers
      trackFetch([
        {
          body: { id: 1, name: 'CI', status: 'completed', conclusion: 'success' },
          headers: {
            'x-ratelimit-remaining': '4999',
            'x-ratelimit-reset': '1700000000',
          },
        },
      ])

      // when
      await client.getWorkflowRun('o', 'r', 1)

      // then: no retry happens when remaining > 0
      expect(fetchCalls.length).toBe(1)
    })

    test('parses x-ratelimit-reset header', async () => {
      // given: 403 with remaining=0, but reset time is in the past so wait is instant
      let callIndex = 0
      globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        callIndex++
        const urlStr = typeof url === 'string' ? url : url.toString()
        fetchCalls.push({ url: urlStr, method: 'GET', body: undefined, headers: {} })

        if (callIndex === 1) {
          return jsonResponse({ message: 'rate limited' }, 403, {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) - 10), // 10 seconds in the past
          })
        }
        return jsonResponse({ id: 1, name: 'CI', status: 'completed', conclusion: 'success' })
      }) as typeof globalThis.fetch

      // when
      await client.getWorkflowRun('o', 'r', 1)

      // then: should have retried immediately
      expect(callIndex).toBe(2)
    })

    test('throws after exhausting max retries', async () => {
      // given: every response is 403 with remaining=0
      let callCount = 0
      globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        callCount++
        const urlStr = typeof url === 'string' ? url : url.toString()
        fetchCalls.push({ url: urlStr, method: 'GET', body: undefined, headers: {} })

        return jsonResponse({ message: 'rate limit exceeded' }, 403, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) - 10),
        })
      }) as typeof globalThis.fetch

      // when & then
      try {
        await client.getWorkflowRun('o', 'r', 1)
        expect.unreachable('Should have thrown')
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(GitHubApiError)
        const message = (err as GitHubApiError).message
        expect(message).toContain('Rate limit retry exhausted')
        // Should have tried initial + 3 retries = 4 calls
        expect(callCount).toBe(4)
      }
    })
  })

  describe('token injection', () => {
    test('sends Authorization Bearer header', async () => {
      // given: API returns valid response
      trackFetch([{ body: { id: 1, name: 'CI', status: 'completed', conclusion: 'success' } }])

      // when
      await client.getWorkflowRun('o', 'r', 1)

      // then
      expect(fetchCalls[0].headers['Authorization']).toBe('Bearer test-token-123')
    })

    test('sends GitHub API version header', async () => {
      // given: API returns valid response
      trackFetch([{ body: { id: 1, name: 'CI', status: 'completed', conclusion: 'success' } }])

      // when
      await client.getWorkflowRun('o', 'r', 1)

      // then
      expect(fetchCalls[0].headers['X-GitHub-Api-Version']).toBe('2022-11-28')
      expect(fetchCalls[0].headers['Accept']).toBe('application/vnd.github+json')
    })
  })

  describe('hashTitle', () => {
    test('produces consistent hashes', async () => {
      // given: two PRs with the same title should produce the same hash
      // We test this indirectly through findExistingPr
      const { createHash } = await import('node:crypto')
      const title = 'Consistent hash test'

      // when: compute hash twice
      const hash1 = createHash('sha256').update(title).digest('hex').slice(0, 12)
      const hash2 = createHash('sha256').update(title).digest('hex').slice(0, 12)

      // then: hashes are identical
      expect(hash1).toBe(hash2)
      expect(hash1.length).toBe(12)
    })

    test('different titles produce different hashes', async () => {
      // given: two different titles
      const { createHash } = await import('node:crypto')

      // when
      const hash1 = createHash('sha256').update('Title A').digest('hex').slice(0, 12)
      const hash2 = createHash('sha256').update('Title B').digest('hex').slice(0, 12)

      // then
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('validateApiResponse', () => {
    test('throws GitHubApiError for null response', async () => {
      // given: API returns null as JSON body (e.g. from a malformed response)
      globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url.toString()
        fetchCalls.push({ url: urlStr, method: 'GET', body: undefined, headers: {} })
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => null,
          text: async () => 'null',
        } as unknown as Response
      }) as typeof globalThis.fetch

      // when & then
      try {
        await client.getWorkflowRun('o', 'r', 1)
        expect.unreachable('Should have thrown')
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(GitHubApiError)
        const message = (err as GitHubApiError).message
        expect(message).toContain('Invalid workflow run response')
      }
    })
  })
})

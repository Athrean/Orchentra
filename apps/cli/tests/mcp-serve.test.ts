import { afterAll, describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { spawnFakeGitHubForMcpTest } from './fixtures/fake-github-server'

const CLI_ENTRY = resolve(import.meta.dir, '..', 'src', 'main.ts')

interface RpcResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: { code: number; message: string }
}

const fake = await spawnFakeGitHubForMcpTest()
afterAll(async () => fake.shutdown())

interface ServerHandle {
  proc: ReturnType<typeof Bun.spawn>
  send: (msg: unknown) => Promise<void>
  next: (id: number) => Promise<RpcResponse>
  close: () => Promise<void>
}

async function spawnServer(extraEnv: Record<string, string> = {}): Promise<ServerHandle> {
  const proc = Bun.spawn({
    cmd: ['bun', CLI_ENTRY, 'mcp', 'serve'],
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      ORCHENTRA_MCP_FAKE_GH_BASE: fake.baseUrl,
      ORCHENTRA_ALLOWED_REPOS: 'my-org/api',
      ...extraEnv,
    },
  }) as ReturnType<typeof Bun.spawn> & {
    stdin: { write: (s: string) => unknown; flush: () => Promise<unknown>; end: () => unknown }
    stdout: ReadableStream<Uint8Array>
  }

  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const pending = new Map<number | string, (r: RpcResponse) => void>()

  let closed = false
  void (async () => {
    while (!closed) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      buffer += decoder.decode(value, { stream: true })
      let idx = buffer.indexOf('\n')
      while (idx !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line.length > 0) {
          try {
            const parsed = JSON.parse(line) as RpcResponse
            const cb = pending.get(parsed.id)
            if (cb) {
              pending.delete(parsed.id)
              cb(parsed)
            }
          } catch {
            // ignore non-JSON-RPC stdout (none expected)
          }
        }
        idx = buffer.indexOf('\n')
      }
    }
  })()

  return {
    proc,
    send: async (msg) => {
      proc.stdin.write(JSON.stringify(msg) + '\n')
      await proc.stdin.flush()
    },
    next: (id) =>
      new Promise<RpcResponse>((resolveResp, rejectResp) => {
        pending.set(id, resolveResp)
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id)
            rejectResp(new Error(`timed out waiting for response id=${id}`))
          }
        }, 5_000)
      }),
    close: async () => {
      closed = true
      try {
        proc.stdin.end()
      } catch {
        /* ignore */
      }
      await Promise.race([proc.exited, new Promise((r) => setTimeout(r, 2_000))])
      try {
        proc.kill()
      } catch {
        /* ignore */
      }
    },
  }
}

describe('orchentra mcp serve (subprocess)', () => {
  test('initialize → tools/list → tools/call get_workflow_logs', async () => {
    fake.setScenario({
      jobs: [
        {
          id: 42,
          name: 'Build & Test',
          conclusion: 'failure',
          steps: [
            { name: 'Checkout', conclusion: 'success' },
            { name: 'Run tests', conclusion: 'failure' },
          ],
          started_at: '2026-03-24T10:00:00Z',
          completed_at: '2026-03-24T10:02:30Z',
        },
      ],
      logsByJobId: { 42: 'failing test output\nassertion failed at line 17' },
    })

    const server = await spawnServer()
    try {
      await server.send({ jsonrpc: '2.0', id: 1, method: 'initialize' })
      const initResp = await server.next(1)
      expect(initResp.error).toBeUndefined()
      const initResult = initResp.result as { protocolVersion: string; serverInfo: { name: string } }
      expect(initResult.protocolVersion).toBe('2025-03-26')
      expect(initResult.serverInfo.name).toBe('orchentra')

      await server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
      const listResp = await server.next(2)
      expect(listResp.error).toBeUndefined()
      const listResult = listResp.result as { tools: Array<{ name: string; description?: string }> }
      expect(listResult.tools.length).toBe(15)
      const names = listResult.tools.map((t) => t.name).sort()
      expect(names).toEqual(
        [
          // GitHub adapter ops
          'get_commit_changes',
          'get_file_content',
          'get_issue',
          'get_pull_request',
          'get_workflow_logs',
          'post_comment',
          'search_code',
          // GitHub Actions read ops (batch A — Slice 4)
          'list_workflow_runs',
          'get_workflow_run',
          'get_workflow_run_jobs',
          // Brain ops (Phase 2 skeleton)
          'export_skills_md',
          'get_runbook',
          'list_episodes',
          'list_runbooks',
          'record_episode',
        ].sort(),
      )

      await server.send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_workflow_logs',
          arguments: { owner: 'my-org', repo: 'api', runId: 123 },
        },
      })
      const callResp = await server.next(3)
      expect(callResp.error).toBeUndefined()
      const callResult = callResp.result as {
        content: Array<{ type: string; text: string }>
        isError?: boolean
      }
      expect(callResult.isError).toBe(false)
      const payload = JSON.parse(callResult.content[0].text) as {
        jobName: string
        failedStep: string | null
        logs: string
        durationSeconds: number | null
      }
      expect(payload.jobName).toBe('Build & Test')
      expect(payload.failedStep).toBe('Run tests')
      expect(payload.logs).toContain('assertion failed')
      expect(payload.durationSeconds).toBe(150)
    } finally {
      await server.close()
    }
  })

  test('tools/call exercises every read-scope op via the lowercase GithubAdapter', async () => {
    fake.setScenario({
      pulls: {
        'my-org/api#7': {
          title: 'Add login flow',
          body: 'Adds login',
          state: 'open',
          merged: false,
          user: { login: 'alice' },
          base: { ref: 'main' },
          head: { ref: 'feature/login' },
          created_at: '2026-04-01T10:00:00Z',
        },
      },
      pullFiles: {
        'my-org/api#7': [{ filename: 'src/login.ts', status: 'added', additions: 50, deletions: 0 }],
      },
      pullReviewComments: {
        'my-org/api#7': [{ user: { login: 'bob' }, body: 'looks good' }],
      },
      issues: {
        'my-org/api#42': {
          title: 'Login is broken',
          body: 'Reproduces on main',
          state: 'open',
          labels: [{ name: 'bug' }],
          user: { login: 'carol' },
          created_at: '2026-04-02T10:00:00Z',
        },
      },
      issueComments: {
        'my-org/api#42': [{ user: { login: 'dave' }, body: 'I can repro' }],
      },
      commits: {
        'my-org/api#abc1234': {
          sha: 'abc1234',
          commit: { message: 'fix login', author: { name: 'alice' } },
          files: [{ filename: 'src/login.ts', status: 'modified', additions: 3, deletions: 1, patch: '@@ -1 +1 @@' }],
        },
      },
      contents: {
        'my-org/api#README.md': {
          type: 'file',
          path: 'README.md',
          content: Buffer.from('hello world').toString('base64'),
          size: 11,
          encoding: 'base64',
        },
      },
      codeSearch: {
        total_count: 1,
        items: [{ path: 'src/login.ts', name: 'login.ts' }],
      },
    })

    const server = await spawnServer()
    try {
      await server.send({ jsonrpc: '2.0', id: 1, method: 'initialize' })
      await server.next(1)

      const calls: Array<{ id: number; name: string; args: Record<string, unknown> }> = [
        { id: 100, name: 'get_pull_request', args: { owner: 'my-org', repo: 'api', number: 7 } },
        { id: 101, name: 'get_issue', args: { owner: 'my-org', repo: 'api', number: 42 } },
        { id: 102, name: 'get_commit_changes', args: { owner: 'my-org', repo: 'api', sha: 'abc1234' } },
        { id: 103, name: 'get_file_content', args: { owner: 'my-org', repo: 'api', path: 'README.md' } },
        { id: 104, name: 'search_code', args: { owner: 'my-org', repo: 'api', query: 'loginHandler' } },
      ]

      const results: Record<string, { isError: boolean; payload: Record<string, unknown> }> = {}
      for (const c of calls) {
        await server.send({
          jsonrpc: '2.0',
          id: c.id,
          method: 'tools/call',
          params: { name: c.name, arguments: c.args },
        })
        const resp = await server.next(c.id)
        expect(resp.error).toBeUndefined()
        const result = resp.result as { content: Array<{ type: string; text: string }>; isError?: boolean }
        results[c.name] = {
          isError: result.isError === true,
          payload: JSON.parse(result.content[0].text) as Record<string, unknown>,
        }
      }

      expect(results.get_pull_request.isError).toBe(false)
      expect(results.get_pull_request.payload.title).toBe('Add login flow')

      expect(results.get_issue.isError).toBe(false)
      expect(results.get_issue.payload.title).toBe('Login is broken')

      expect(results.get_commit_changes.isError).toBe(false)
      expect(results.get_commit_changes.payload.sha).toBe('abc1234')

      expect(results.get_file_content.isError).toBe(false)
      expect(results.get_file_content.payload.content).toBe('hello world')

      expect(results.search_code.isError).toBe(false)
      const searchPayload = results.search_code.payload as { total: number; results: Array<{ path: string }> }
      expect(searchPayload.total).toBe(1)
      expect(searchPayload.results[0].path).toBe('src/login.ts')
    } finally {
      await server.close()
    }
  })

  test('tools/call post_comment surfaces a clear permission_denied error', async () => {
    // post_comment is scope:'write' and dispatch enforces a remote-write
    // approval gate. Until Slice C wires per-call creds + an approval flow,
    // this op MUST surface as isError:true with permission_denied so callers
    // see the gap instead of a silent stub.
    fake.setScenario({})
    const server = await spawnServer()
    try {
      await server.send({ jsonrpc: '2.0', id: 1, method: 'initialize' })
      await server.next(1)

      await server.send({
        jsonrpc: '2.0',
        id: 200,
        method: 'tools/call',
        params: {
          name: 'post_comment',
          arguments: { owner: 'my-org', repo: 'api', prNumber: 7, body: 'hi', kind: 'note' },
        },
      })
      const resp = await server.next(200)
      expect(resp.error).toBeUndefined()
      const result = resp.result as { content: Array<{ type: string; text: string }>; isError?: boolean }
      expect(result.isError).toBe(true)
      const payload = JSON.parse(result.content[0].text) as { code: string; message: string }
      expect(payload.code).toBe('permission_denied')
      expect(payload.message).toContain('post_comment')
    } finally {
      await server.close()
    }
  })
})

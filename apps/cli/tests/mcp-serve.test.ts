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
      expect(listResult.tools.length).toBe(1)
      expect(listResult.tools[0].name).toBe('get_workflow_logs')

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
})

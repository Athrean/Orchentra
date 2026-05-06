import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawn, type Subprocess } from 'bun'
import { join } from 'path'

const FIXTURE = join(import.meta.dir, 'fixtures/test-server.ts')

let proc: Subprocess<'pipe', 'pipe', 'pipe'>
const pendingResolvers = new Map<number, (value: unknown) => void>()
let stdoutBuffer = ''

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

async function startServer(): Promise<void> {
  proc = spawn(['bun', 'run', FIXTURE], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  }) as Subprocess<'pipe', 'pipe', 'pipe'>

  // Stream stdout, deliver responses by id.
  ;(async () => {
    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()
    let done = false
    while (!done) {
      const next = await reader.read()
      done = next.done
      if (!next.value) continue
      stdoutBuffer += decoder.decode(next.value, { stream: true })
      let nl = stdoutBuffer.indexOf('\n')
      while (nl >= 0) {
        const line = stdoutBuffer.slice(0, nl).trim()
        stdoutBuffer = stdoutBuffer.slice(nl + 1)
        nl = stdoutBuffer.indexOf('\n')
        if (!line) continue
        try {
          const msg = JSON.parse(line) as JsonRpcResponse
          const resolver = pendingResolvers.get(msg.id)
          if (resolver) {
            pendingResolvers.delete(msg.id)
            resolver(msg)
          }
        } catch {
          // ignore non-JSON noise
        }
      }
    }
  })().catch(() => {
    /* swallowed; the test process will assert on per-call outcomes */
  })
}

let nextId = 1
async function rpc(method: string, params: unknown = {}): Promise<JsonRpcResponse> {
  const id = nextId++
  const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
  const stdin = proc.stdin as { write: (data: string) => void; flush?: () => void }
  stdin.write(payload)
  stdin.flush?.()
  return new Promise<JsonRpcResponse>((resolve) => {
    pendingResolvers.set(id, resolve as (v: unknown) => void)
  })
}

beforeAll(async () => {
  await startServer()
})

afterAll(() => {
  proc.kill()
})

describe('orchentra mcp serve (stdio)', () => {
  test('initialize round-trips', async () => {
    const res = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} })
    expect(res.result).toBeDefined()
    expect((res.result as { serverInfo: { name: string } }).serverInfo.name).toBe('orchentra-mcp')
  })

  test('tools/list returns the migrated read-scoped GitHub tools and the brain ops', async () => {
    const res = await rpc('tools/list')
    const tools = (res.result as { tools: Array<{ name: string }> }).tools
    const names = tools.map((t) => t.name).sort()

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
        // GitHub read ops batch B (Slice 5)
        'get_repo_metadata',
        'list_branches',
        'list_check_runs',
        'list_issues',
        'list_pull_requests',
        // Brain ops (Phase 2 skeleton)
        'export_skills_md',
        'get_runbook',
        'list_episodes',
        'list_runbooks',
        'record_episode',
      ].sort(),
    )
  })

  test('tools/call get_commit_changes succeeds with the fake adapter', async () => {
    const res = await rpc('tools/call', {
      name: 'get_commit_changes',
      arguments: { owner: 'my-org', repo: 'api', sha: 'abc1234' },
    })
    const result = res.result as { content: Array<{ type: string; text: string }>; isError?: boolean }
    expect(result.isError).toBeFalsy()
    const payload = JSON.parse(result.content[0].text) as { sha: string }
    expect(payload.sha).toBe('abc1234')
  })

  test('tools/call rejects malformed input as an isError result', async () => {
    const res = await rpc('tools/call', {
      name: 'get_commit_changes',
      arguments: { owner: 'my-org' },
    })
    const result = res.result as { isError: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('invalid_input')
  })
})

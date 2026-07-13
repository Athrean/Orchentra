import { describe, expect, test } from 'bun:test'
import { bashTool } from '../src/tools/bash-tool'
import {
  InMemoryTaskStore,
  ProcessSupervisor,
  type SharedToolState,
  type SupervisedHandle,
  type ToolContext,
} from '@orchentra/cli-core'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

function handle(opts?: { stdout?: ReadableStream<Uint8Array>; exitCode?: number }): SupervisedHandle {
  const exited = opts?.exitCode === undefined ? new Promise<number>(() => {}) : Promise.resolve(opts.exitCode)
  return { pid: 999, exited, kill: () => {}, stdout: opts?.stdout ?? null, stderr: null }
}

function ctxWith(supervisor: ProcessSupervisor): ToolContext {
  const sharedState: SharedToolState = {
    taskStore: new InMemoryTaskStore(),
    todos: [],
    agentCounter: 0,
    planMode: false,
    processSupervisor: supervisor,
  }
  return { sessionId: 's', cwd: '/tmp', permissionMode: 'workspace-write', sharedState }
}

describe('bash run_in_background', () => {
  test('routes through the supervisor and returns a ready handle with URL', async () => {
    const h = handle({ stdout: streamOf(['starting\n', '  Local: http://127.0.0.1:3000/\n']) })
    const supervisor = new ProcessSupervisor({ spawn: () => h, probe: async () => true, baseEnv: {} })
    const res = await bashTool.execute({ command: 'bun dev', run_in_background: true }, ctxWith(supervisor))

    expect(res.isError).toBe(false)
    expect(res.content).toContain('background process ready')
    expect(res.content).toContain('http://127.0.0.1:3000/')
    expect(res.content).toContain('unsandboxed')
    const data = res.data as { status: string; url?: string; backgroundProcessId: string }
    expect(data.status).toBe('ready')
    expect(data.url).toBe('http://127.0.0.1:3000/')
    expect(data.backgroundProcessId).toBeTruthy()
    // the supervisor actually holds the process
    expect(supervisor.list()).toHaveLength(1)
  })

  test('does not block on exit — an early crash comes back as failed, not a hang', async () => {
    const h = handle({ exitCode: 1 })
    const supervisor = new ProcessSupervisor({ spawn: () => h, probe: async () => false, baseEnv: {} })
    const res = await bashTool.execute({ command: 'bun dev', run_in_background: true }, ctxWith(supervisor))

    expect(res.isError).toBe(true)
    expect(res.content).toContain('background process failed')
    const data = res.data as { status: string }
    expect(data.status).toBe('failed')
  })

  test('command validation still runs before backgrounding', async () => {
    const supervisor = new ProcessSupervisor({ spawn: () => handle(), probe: async () => true, baseEnv: {} })
    const res = await bashTool.execute({ command: '', run_in_background: true }, ctxWith(supervisor))
    expect(res.isError).toBe(true)
    expect(res.content).toContain('command is required')
    expect(supervisor.list()).toHaveLength(0)
  })
})

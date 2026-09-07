import { describe, expect, test } from 'bun:test'
import { SpeculativeToolBroker, parseSpeculativeProgramCall } from '../src/runtime/speculative-tools'
import type { ToolSchedulingMetadata } from '../src/runtime/tools'

const safe: ToolSchedulingMetadata = {
  pure: true,
  idempotent: true,
  concurrencySafe: true,
  speculativeSafe: true,
  resourceClass: 'filesystem',
}

describe('SpeculativeToolBroker', () => {
  test('parses only the exact JSON-literal async call shape', () => {
    const code = '(async () => await tools.call("grep_search", {"path":"src","pattern":"needle"}))()'
    expect(parseSpeculativeProgramCall(JSON.stringify({ code }))).toMatchObject({
      toolName: 'grep_search',
      input: { path: 'src', pattern: 'needle' },
    })
    expect(parseSpeculativeProgramCall(JSON.stringify({ code: 'tools.call(name, args)' }))).toBeNull()
    expect(parseSpeculativeProgramCall('{"code":')).toBeNull()
  })

  test('reuses one matching launch and records its head start', async () => {
    const records: Array<{ status: string; savedWaitMs: number; extraComputeMs: number }> = []
    let executions = 0
    const broker = new SpeculativeToolBroker({
      enabled: true,
      scheduling: () => safe,
      execute: async (toolName, input) => {
        executions++
        await new Promise((resolve) => setTimeout(resolve, 10))
        return {
          result: { id: 'spec-1', content: `${toolName}:${JSON.stringify(input)}`, isError: false },
          reusable: true,
        }
      },
      onAttempt: (attempt) => records.push(attempt),
    })
    const code = '(async () => await tools.call("grep_search", {"path":"src","pattern":"needle"}))()'
    broker.observe('outer-1', 'rlm_execute', JSON.stringify({ code }))
    await new Promise((resolve) => setTimeout(resolve, 3))
    const binding = broker.bind('outer-1', 'rlm_execute', { code })
    const result = await binding?.consume('grep_search', { pattern: 'needle', path: 'src' })
    await binding?.finish()
    await broker.close()

    expect(executions).toBe(1)
    expect(result?.content).toContain('grep_search')
    expect(records).toHaveLength(1)
    expect(records[0]!.status).toBe('matched')
    expect(records[0]!.savedWaitMs).toBeGreaterThan(0)
    expect(records[0]!.extraComputeMs).toBe(0)
  })

  test('launches nothing for unknown metadata and discards a final mismatch', async () => {
    const records: Array<{ status: string; reason?: string; extraComputeMs: number }> = []
    let executions = 0
    const broker = new SpeculativeToolBroker({
      enabled: true,
      scheduling: (name) => (name === 'safe' ? safe : { ...safe, speculativeSafe: false }),
      execute: async () => {
        executions++
        await new Promise((resolve) => setTimeout(resolve, 2))
        return { result: { id: 'spec-1', content: 'unused', isError: false }, reusable: true }
      },
      onAttempt: (attempt) => records.push(attempt),
    })
    broker.observe(
      'outer-unknown',
      'rlm_execute',
      JSON.stringify({ code: '(async () => await tools.call("unknown", {"x":1}))()' }),
    )
    const predicted = '(async () => await tools.call("safe", {"x":1}))()'
    broker.observe('outer-mismatch', 'rlm_execute', JSON.stringify({ code: predicted }))
    expect(broker.bind('outer-mismatch', 'rlm_execute', { code: predicted.replace('1', '2') })).toBeNull()
    await broker.close()

    expect(executions).toBe(1)
    expect(records).toMatchObject([{ status: 'discarded', reason: 'final_call_mismatch' }])
    expect(records[0]!.extraComputeMs).toBeGreaterThanOrEqual(0)
  })

  test('close waits for a pending discard and its asynchronous trace write', async () => {
    const order: string[] = []
    const broker = new SpeculativeToolBroker({
      enabled: true,
      scheduling: () => safe,
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push('execution-settled')
        return { result: { id: 's', content: 'read', isError: false }, reusable: true }
      },
      onAttempt: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push('trace-written')
      },
    })
    const code = '(async () => tools.call("safe", {}))()'
    broker.observe('outer', 'rlm_execute', JSON.stringify({ code }))
    broker.bind('outer', 'rlm_execute', { code: '42' })
    await broker.close()
    order.push('closed')
    broker.observe('after-close', 'rlm_execute', JSON.stringify({ code }))
    expect(order).toEqual(['execution-settled', 'trace-written', 'closed'])
  })

  test('a synchronous execution failure becomes a failed attempt and permits normal fallback', async () => {
    const statuses: string[] = []
    const broker = new SpeculativeToolBroker({
      enabled: true,
      scheduling: () => safe,
      execute: () => {
        throw new Error('failed launch')
      },
      onAttempt: (attempt) => {
        statuses.push(attempt.status)
      },
    })
    const code = '(async () => tools.call("safe", {}))()'
    broker.observe('outer', 'rlm_execute', JSON.stringify({ code }))
    expect(await broker.bind('outer', 'rlm_execute', { code })?.consume('safe', {})).toBeNull()
    await broker.close()
    expect(statuses).toEqual(['failed'])
  })

  test('caps pending speculative executions at four and defaults off', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let executions = 0
    const options = {
      scheduling: () => safe,
      execute: async () => {
        executions++
        await pending
        return { result: { id: 's', content: 'ok', isError: false }, reusable: true }
      },
    }
    const broker = new SpeculativeToolBroker({ ...options, enabled: true })
    const disabled = new SpeculativeToolBroker({ ...options, enabled: false })
    const input = JSON.stringify({ code: '(async () => tools.call("safe", {}))()' })
    for (let i = 0; i < 10; i++) {
      broker.observe(String(i), 'rlm_execute', input)
      disabled.observe(String(i), 'rlm_execute', input)
    }
    await Promise.resolve()
    expect(executions).toBe(4)
    release()
    await broker.close()
    await disabled.close()
  })
})

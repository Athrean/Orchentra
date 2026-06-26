import { describe, expect, test } from 'bun:test'
import { build, type RunSlice, type RunCheck } from '../src/composites/build'
import type { Slice } from '../src/composites/slices'

function slice(id: string, files: string[], dependsOn: string[] = []): Slice {
  return { id, title: id, intent: id, files, dependsOn }
}

const okRun: RunSlice = async () => ({ text: 'done', tokensIn: 10, tokensOut: 5 })
const pass: RunCheck = async () => ({ passed: true, output: '' })
const fail: RunCheck = async () => ({ passed: false, output: 'tsc: error' })

describe('build orchestrator', () => {
  test('a slice whose check passes lands in completed', async () => {
    const r = await build({ slices: [slice('a', ['a.ts'])], runSlice: okRun, runCheck: pass })

    expect(r.completed.map((s) => s.slice.id)).toEqual(['a'])
    expect(r.failed).toEqual([])
    expect(r.skipped).toEqual([])
  })

  test('a slice whose check fails lands in failed with the check output', async () => {
    const r = await build({ slices: [slice('a', ['a.ts'])], runSlice: okRun, runCheck: fail })

    expect(r.failed.map((s) => s.slice.id)).toEqual(['a'])
    expect(r.failed[0].output).toBe('tsc: error')
    expect(r.completed).toEqual([])
  })

  test('accumulates token usage across slices', async () => {
    const r = await build({
      slices: [slice('a', ['a.ts']), slice('b', ['b.ts'])],
      runSlice: okRun,
      runCheck: pass,
    })

    expect(r.tokensIn).toBe(20)
    expect(r.tokensOut).toBe(10)
  })

  test('runs file-disjoint slices in the same wave', async () => {
    const r = await build({
      slices: [slice('a', ['a.ts']), slice('b', ['b.ts'])],
      runSlice: okRun,
      runCheck: pass,
    })

    expect(r.completed.map((s) => s.slice.id).sort()).toEqual(['a', 'b'])
  })

  test('can run a wave serially for a shared runtime runner', async () => {
    const events: string[] = []
    const r = await build({
      slices: [slice('a', ['a.ts']), slice('b', ['b.ts'])],
      runSlice: async (s) => {
        events.push(`run:${s.id}`)
        return { text: 'done', tokensIn: 1, tokensOut: 1 }
      },
      runCheck: async (s) => {
        events.push(`check:${s.id}`)
        return { passed: true, output: '' }
      },
      parallel: false,
    })

    expect(r.completed.map((s) => s.slice.id)).toEqual(['a', 'b'])
    expect(events).toEqual(['run:a', 'check:a', 'run:b', 'check:b'])
  })

  test('stops at the budget and skips later waves without running them', async () => {
    const calls: string[] = []
    const trackRun: RunSlice = async (s) => {
      calls.push(s.id)
      return { text: 'done', tokensIn: 10, tokensOut: 5 }
    }
    // Shared file → two waves; budget covers exactly the first wave.
    const r = await build({
      slices: [slice('a', ['shared.ts']), slice('b', ['shared.ts'])],
      runSlice: trackRun,
      runCheck: pass,
      budget: { maxTokens: 15 },
    })

    expect(r.completed.map((s) => s.slice.id)).toEqual(['a'])
    expect(r.skipped.map((s) => s.slice.id)).toEqual(['b'])
    expect(calls).toEqual(['a'])
  })
})

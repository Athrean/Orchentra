import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { buildLearningCurriculum } from '@orchentra/cli-core'
import { parseArgs } from '../src/args'
import { runCurriculumCommand } from '../src/commands/run-curriculum'

describe('orchentra curriculum', () => {
  test('parses seed/split/list and rejects invalid ones', () => {
    expect(parseArgs(['bun', 'cli', 'curriculum'])).toMatchObject({ kind: 'curriculum', seed: 1, list: false })
    expect(parseArgs(['bun', 'cli', 'curriculum', '--seed=7', '--split', 'length-transfer', '--list'])).toMatchObject({
      seed: 7,
      split: 'length-transfer',
      list: true,
    })
    expect(() => parseArgs(['bun', 'cli', 'curriculum', '--split', 'nope'])).toThrow('invalid split')
    expect(() => parseArgs(['bun', 'cli', 'curriculum', '--seed', '-1'])).toThrow('uint32')
    expect(() => parseArgs(['bun', 'cli', 'curriculum', '--bogus'])).toThrow('unknown argument')
  })

  test('--list emits the deterministic corpus without calling a model', async () => {
    let out = ''
    expect(await runCurriculumCommand({ seed: 5, model: 'unused', list: true, stdout: (t) => (out += t) })).toBe(0)
    const listed = JSON.parse(out)
    expect(listed.corpusHash).toBe(buildLearningCurriculum(5).corpusHash)
    expect(listed.cases).toHaveLength(12)
  })

  test('aggregates pass rates per split, unfences answers, and survives a failing case', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orchentra-curriculum-cmd-'))
    try {
      const outPath = join(dir, 'nested', 'board.json')
      let calls = 0
      const code = await runCurriculumCommand({
        seed: 5,
        model: 'scripted-fixture',
        out: outPath,
        stdout: () => {},
        stderr: () => {},
        runner: async (task) => {
          calls++
          // Every train case answers correctly inside a fence; one
          // length-transfer case answers wrong; one errors outright.
          if (task.split === 'train') {
            return {
              answer: '```json\n' + JSON.stringify(task.verifier.expectedIds) + '\n```',
              doneReason: 'stop' as const,
            }
          }
          if (task.scale === 32) throw new Error('provider unavailable')
          return { answer: JSON.stringify(['wrong']), doneReason: 'stop' as const }
        },
      })
      expect(code).toBe(0)
      const board = JSON.parse(await readFile(outPath, 'utf8'))
      expect(calls).toBe(12)
      expect(board.bySplit.train).toMatchObject({ passed: 4, total: 4 })
      expect(board.bySplit['length-transfer']).toMatchObject({ passed: 0, total: 4 })
      expect(board.bySplit['domain-transfer']).toMatchObject({ passed: 0, total: 4 })
      expect(board.results.filter((r: { doneReason: string }) => r.doneReason === 'error')).toHaveLength(4)
      expect(board.interfaceHash).toBe(buildLearningCurriculum(5).interfaceHash)
      expect(board.executionProfile).toBe('rlm')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('--split runs only that split', async () => {
    let out = ''
    await runCurriculumCommand({
      seed: 5,
      model: 'scripted-fixture',
      split: 'domain-transfer',
      stdout: (t) => (out += t),
      runner: async (task) => ({ answer: task.verifier.expectedIds, doneReason: 'stop' as const }),
    })
    const board = JSON.parse(out)
    expect(Object.keys(board.bySplit)).toEqual(['domain-transfer'])
    expect(board.bySplit['domain-transfer']).toMatchObject({ passed: 4, total: 4 })
  })

  // Regression: process.exit() used to drop queued stdout, so any piped output
  // past one pipe buffer came back truncated with a zero exit code.
  test('emits complete output through a pipe, past the 64 KiB pipe buffer', async () => {
    const proc = Bun.spawn(
      [
        process.execPath,
        resolve(import.meta.dir, '../src/main.ts'),
        'curriculum',
        '--list',
        '--split',
        'length-transfer',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const text = await new Response(proc.stdout).text()
    expect(await proc.exited).toBe(0)
    expect(text.length).toBeGreaterThan(65_536)
    expect(JSON.parse(text).cases).toHaveLength(4)
  })
})

test('an errored case carries the provider message, not just an error flag', async () => {
  let out = ''
  const code = await runCurriculumCommand({
    seed: 1,
    model: 'test',
    split: 'train',
    runner: async () => {
      throw new Error('Zen API error: 400 MissingSessionID')
    },
    stdout: (text) => {
      out += text
    },
    stderr: () => {},
  })
  expect(code).toBe(0)
  const report = JSON.parse(out) as { results: { doneReason: string; error?: string }[] }
  expect(report.results[0]?.doneReason).toBe('error')
  expect(report.results[0]?.error).toContain('MissingSessionID')
})

test('per-split totals carry tokens and wall time, not just pass counts', async () => {
  // Both arms answering everything correctly is the expected outcome on a
  // saturated corpus; token cost is then the only axis left to compare.
  let out = ''
  await runCurriculumCommand({
    seed: 1,
    model: 'test',
    split: 'train',
    runner: async (task) => ({
      answer: task.verifier.expectedIds,
      doneReason: 'stop' as const,
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, cacheCreationTokens: 0 },
    }),
    stdout: (text) => {
      out += text
    },
    stderr: () => {},
  })
  const board = JSON.parse(out) as {
    bySplit: Record<string, { inputTokens: number; outputTokens: number; cacheReadTokens: number; wallMs: number }>
    results: { usage?: unknown; wallMs: number }[]
  }
  expect(board.bySplit.train).toMatchObject({ inputTokens: 400, outputTokens: 80, cacheReadTokens: 20 })
  expect(board.bySplit.train?.wallMs).toBeGreaterThanOrEqual(0)
  expect(board.results[0]?.usage).toBeDefined()
})

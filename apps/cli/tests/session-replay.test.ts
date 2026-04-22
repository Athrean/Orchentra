import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runSessionReplay } from '../src/commands/session-replay'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'orchentra-replay-'))
}

function writeFixture(path: string, records: unknown[]): void {
  const body = records.map((r) => JSON.stringify(r)).join('\n') + '\n'
  writeFileSync(path, body, 'utf8')
}

describe('runSessionReplay', () => {
  test('prints each event as one JSON line to stdout', async () => {
    const dir = makeDir()
    try {
      const meta = { id: 'abc', createdAt: '2026-04-21T00:00:00.000Z', cwd: '/tmp', model: 'test' }
      const events = [
        { kind: 'text', delta: 'hello' },
        {
          kind: 'done',
          reason: 'stop',
          steps: 1,
          usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
        },
      ]
      const records = events.map((event, i) => ({ meta, event, at: `2026-04-21T00:00:0${i}.000Z` }))
      writeFixture(join(dir, 'abc.jsonl'), records)

      const lines: string[] = []
      const code = await runSessionReplay({
        idOrLatest: 'abc',
        rootDir: dir,
        out: (line): void => {
          lines.push(line)
        },
      })

      expect(code).toBe(0)
      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0]!)).toEqual(events[0])
      expect(JSON.parse(lines[1]!)).toEqual(events[1])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('resolves latest when requested', async () => {
    const dir = makeDir()
    try {
      const meta = { id: 'older', createdAt: '2026-04-20T00:00:00.000Z', cwd: '/tmp', model: 'test' }
      writeFixture(join(dir, 'older.jsonl'), [
        { meta, event: { kind: 'text', delta: 'old' }, at: '2026-04-20T00:00:00.000Z' },
      ])
      await new Promise((r) => setTimeout(r, 10))
      const metaNew = { id: 'newer', createdAt: '2026-04-21T00:00:00.000Z', cwd: '/tmp', model: 'test' }
      writeFixture(join(dir, 'newer.jsonl'), [
        { meta: metaNew, event: { kind: 'text', delta: 'new' }, at: '2026-04-21T00:00:00.000Z' },
      ])

      const lines: string[] = []
      const code = await runSessionReplay({
        idOrLatest: 'latest',
        rootDir: dir,
        out: (line): void => {
          lines.push(line)
        },
      })

      expect(code).toBe(0)
      expect(JSON.parse(lines[0]!)).toEqual({ kind: 'text', delta: 'new' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('returns 1 and writes error when session missing', async () => {
    const dir = makeDir()
    try {
      const errs: string[] = []
      const code = await runSessionReplay({
        idOrLatest: 'latest',
        rootDir: dir,
        out: (): void => {},
        err: (line): void => {
          errs.push(line)
        },
      })
      expect(code).toBe(1)
      expect(errs.join(' ')).toMatch(/no sessions|not found/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('roundtrip preserves event byte-identity', async () => {
    const dir = makeDir()
    try {
      const meta = { id: 'rt', createdAt: '2026-04-21T00:00:00.000Z', cwd: '/tmp', model: 'test' }
      const events = [
        { kind: 'text', delta: 'a' },
        {
          kind: 'span_start',
          spanId: 's1',
          name: 'step',
          startedAt: '2026-04-21T00:00:00.100Z',
          attributes: { step: 1 },
        },
        { kind: 'tool_use', call: { id: 'tc1', name: 'read', input: { path: '/x' } } },
        { kind: 'span_end', spanId: 's1', endedAt: '2026-04-21T00:00:00.200Z', status: 'ok' },
      ]
      const records = events.map((event, i) => ({ meta, event, at: `2026-04-21T00:00:0${i}.000Z` }))
      writeFixture(join(dir, 'rt.jsonl'), records)

      const lines: string[] = []
      await runSessionReplay({
        idOrLatest: 'rt',
        rootDir: dir,
        out: (line): void => {
          lines.push(line)
        },
      })

      expect(lines.map((l) => JSON.parse(l))).toEqual(events)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

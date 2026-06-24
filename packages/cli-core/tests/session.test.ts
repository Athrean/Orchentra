import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  CURRENT_SESSION_PROTOCOL_VERSION,
  SessionWriter,
  replaySession,
  resolveSessionPath,
} from '../src/runtime/session'

describe('SessionWriter', () => {
  function makeDir(): string {
    return mkdtempSync(join(tmpdir(), 'orchentra-test-'))
  }

  test('creates session file and appends events', async () => {
    const dir = makeDir()
    try {
      const writer = await SessionWriter.open({
        rootDir: dir,
        meta: { cwd: '/tmp', model: 'test' },
      })
      await writer.append({ kind: 'text', delta: 'hello' })
      await writer.append({
        kind: 'done',
        reason: 'stop',
        steps: 1,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      })
      await writer.close()

      const records = await replaySession(writer.path)
      expect(records).toHaveLength(2)
      expect(records[0]!.event.kind).toBe('text')
      expect(records[1]!.event.kind).toBe('done')
      expect(records[0]!.meta.model).toBe('test')
      const rawRecord = JSON.parse(readFileSync(writer.path, 'utf8').split('\n')[0]!)
      expect(rawRecord.protocolVersion).toBe(CURRENT_SESSION_PROTOCOL_VERSION)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('respects custom id', async () => {
    const dir = makeDir()
    try {
      const writer = await SessionWriter.open({
        rootDir: dir,
        id: 'custom-id',
        meta: { cwd: '/tmp', model: 'test' },
      })
      await writer.close()
      expect(existsSync(join(dir, 'custom-id.jsonl'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('session protocol migration', () => {
  test('replays legacy records without protocolVersion', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-test-'))
    try {
      const path = join(dir, 'legacy.jsonl')
      const meta = { id: 'legacy', createdAt: '2026-04-21T00:00:00.000Z', cwd: '/tmp', model: 'test' }
      writeFileSync(path, JSON.stringify({ meta, event: { kind: 'text', delta: 'legacy' }, at: meta.createdAt }) + '\n')

      const records = await replaySession(path)
      expect(records).toHaveLength(1)
      expect(records[0]!.protocolVersion).toBe(CURRENT_SESSION_PROTOCOL_VERSION)
      expect(records[0]!.event).toEqual({ kind: 'text', delta: 'legacy' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('skips records from unknown future protocol versions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-test-'))
    try {
      const path = join(dir, 'future.jsonl')
      const meta = { id: 'future', createdAt: '2026-04-21T00:00:00.000Z', cwd: '/tmp', model: 'test' }
      const current = {
        protocolVersion: CURRENT_SESSION_PROTOCOL_VERSION,
        meta,
        event: { kind: 'text', delta: 'current' },
        at: meta.createdAt,
      }
      const future = {
        protocolVersion: CURRENT_SESSION_PROTOCOL_VERSION + 1,
        meta,
        event: { kind: 'text', delta: 'future' },
        at: meta.createdAt,
      }
      writeFileSync(path, `${JSON.stringify(current)}\n${JSON.stringify(future)}\n`)

      const records = await replaySession(path)
      expect(records).toHaveLength(1)
      expect(records[0]!.event).toEqual({ kind: 'text', delta: 'current' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('replaySession byte-identity', () => {
  test('re-serializing replayed records reproduces input JSONL', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-test-'))
    try {
      const writer = await SessionWriter.open({
        rootDir: dir,
        meta: { cwd: '/tmp', model: 'test' },
      })
      await writer.append({ kind: 'text', delta: 'hello' })
      await writer.append({
        kind: 'span_start',
        spanId: 's1',
        name: 'step',
        startedAt: '2026-04-21T00:00:00.000Z',
        attributes: { step: 1 },
      })
      await writer.append({
        kind: 'span_end',
        spanId: 's1',
        endedAt: '2026-04-21T00:00:00.100Z',
        status: 'ok',
      })
      await writer.append({
        kind: 'done',
        reason: 'stop',
        steps: 1,
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      })
      await writer.close()

      const { readFileSync } = await import('node:fs')
      const rawInput = readFileSync(writer.path, 'utf8')

      const records = await replaySession(writer.path)
      const roundtrip = records.map((r) => JSON.stringify(r)).join('\n') + '\n'
      expect(roundtrip).toBe(rawInput)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('resolveSessionPath', () => {
  test('resolves explicit id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-test-'))
    try {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(join(dir, 'abc.jsonl'), '{}\n')
      const path = await resolveSessionPath('abc', dir)
      expect(path).toBe(join(dir, 'abc.jsonl'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('throws when no sessions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-test-'))
    try {
      expect(resolveSessionPath('latest', dir)).rejects.toThrow('no sessions')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

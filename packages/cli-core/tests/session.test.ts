import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SessionWriter, replaySession, resolveSessionPath } from '../src/runtime/session'

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

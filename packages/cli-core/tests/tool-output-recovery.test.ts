import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { persistOriginalToolOutput, toolResultPath } from '../src/runtime/tool-output-recovery'

describe('toolResultPath', () => {
  test('is deterministic from cwd, sessionId, and toolCallId', () => {
    const path = toolResultPath('/repo', 'session-1', 'call-1')
    expect(path).toBe(join('/repo', '.orchentra', 'sessions', 'session-1', 'tool-results', 'call-1.txt'))
  })
})

describe('persistOriginalToolOutput', () => {
  test('writes the full untrimmed content to the computed path, creating parent dirs', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tool-output-recovery-'))
    try {
      const path = toolResultPath(cwd, 'session-1', 'call-1')
      const original = 'H'.repeat(50) + 'M'.repeat(900) + 'T'.repeat(50)
      await persistOriginalToolOutput(path, original)
      const written = await readFile(path, 'utf8')
      expect(written).toBe(original)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})

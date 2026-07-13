import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FileTraceSink,
  reconstructTranscript,
  traceArtifactsDir,
  traceEventsPath,
  traceManifestPath,
  type TraceManifest,
} from '../src/runtime/trace'
import type { RuntimeEvent } from '../src/runtime/events'

const manifest: TraceManifest = {
  traceId: 't1',
  sessionId: 's1',
  model: 'test-model',
  startedAt: '2026-07-13T00:00:00.000Z',
  endedAt: '2026-07-13T00:00:05.000Z',
  doneReason: 'stop',
  steps: 2,
  usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheCreationTokens: 0 },
  billedTokens: 15,
  cachedTokens: 3,
  estimatedCostUsd: 0.001,
  quirks: { 'test-model': { malformed_args: 1 } },
  eventCounts: { text: 2, done: 1 },
}

describe('FileTraceSink', () => {
  test('appends events as JSONL and writes the manifest', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'trace-'))
    const sink = new FileTraceSink(cwd, 't1')

    await sink.append({ kind: 'user_message', content: 'hello' })
    await sink.append({ kind: 'text', delta: 'world' })
    await sink.finalize(manifest)

    const lines = readFileSync(traceEventsPath(cwd, 't1'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!)).toEqual({ kind: 'user_message', content: 'hello' })
    expect(JSON.parse(lines[1]!)).toEqual({ kind: 'text', delta: 'world' })

    const written = JSON.parse(readFileSync(traceManifestPath(cwd, 't1'), 'utf8')) as TraceManifest
    expect(written).toEqual(manifest)
  })

  test('layout matches 12-TRACE-SYSTEM: per-run dir with events, manifest, artifacts', () => {
    expect(traceEventsPath('/repo', 'r1')).toBe('/repo/.orchentra/traces/r1/events.jsonl')
    expect(traceManifestPath('/repo', 'r1')).toBe('/repo/.orchentra/traces/r1/manifest.json')
    expect(traceArtifactsDir('/repo', 'r1')).toBe('/repo/.orchentra/traces/r1/artifacts')
  })

  test('finalize creates the artifacts directory', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'trace-'))
    const sink = new FileTraceSink(cwd, 't2')
    await sink.finalize(manifest)
    const dir = traceArtifactsDir(cwd, 't2')
    expect(existsSync(dir)).toBe(true)
    expect(statSync(dir).isDirectory()).toBe(true)
  })
})

describe('reconstructTranscript', () => {
  test('rebuilds a multi-step transcript from events alone', () => {
    const events: RuntimeEvent[] = [
      { kind: 'user_message', content: 'do the thing' },
      { kind: 'tool_use', call: { id: 'tc1', name: 'bash', input: { command: 'ls' } } },
      { kind: 'tool_result', result: { id: 'tc1', content: 'a.txt', isError: false } },
      { kind: 'text', delta: 'done ' },
      { kind: 'text', delta: 'here' },
      {
        kind: 'done',
        reason: 'stop',
        steps: 2,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      },
    ]
    expect(reconstructTranscript(events)).toEqual([
      { role: 'user', content: 'do the thing' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'tc1', name: 'bash', input: { command: 'ls' } }] },
      { role: 'tool', content: 'a.txt', toolCallId: 'tc1' },
      { role: 'assistant', content: 'done here' },
    ])
  })

  test('replays the compaction splice the runtime made', () => {
    const events: RuntimeEvent[] = [
      { kind: 'user_message', content: 'first' },
      { kind: 'text', delta: 'reply one' },
      { kind: 'user_message', content: 'second' },
      { kind: 'compacted', droppedMessageCount: 2, tokensSaved: 100, summary: 'user asked; agent replied' },
      { kind: 'text', delta: 'reply two' },
    ]
    expect(reconstructTranscript(events)).toEqual([
      { role: 'user', content: '[context-compacted] earlier turns summarized:\nuser asked; agent replied' },
      { role: 'user', content: 'second' },
      { role: 'assistant', content: 'reply two' },
    ])
  })
})

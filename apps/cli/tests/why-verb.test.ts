import { describe, expect, test } from 'bun:test'
import { runWhy } from '../src/commands/run-why'
import type { GraphNodeDto } from '@orchentra/cli-api'

const fakeNode = (overrides: Partial<GraphNodeDto> = {}): GraphNodeDto => ({
  id: 'leaf',
  parentNodeId: 'mid',
  kind: 'tool_call',
  integration: 'github',
  round: 3,
  durationMs: 200,
  argsJson: null,
  resultJson: null,
  createdAt: '2026-04-29T00:00:00Z',
  ...overrides,
})

function captureStreams(): { stdout: string[]; stderr: string[]; restore: () => void } {
  const stdout: string[] = []
  const stderr: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
    return true
  }) as typeof process.stderr.write
  return {
    stdout,
    stderr,
    restore: () => {
      process.stdout.write = origOut
      process.stderr.write = origErr
    },
  }
}

describe('runWhy (verb path)', () => {
  test('renders ancestor chain + pretty-printed argsJson to stdout', async () => {
    const cap = captureStreams()
    let code: number
    try {
      code = await runWhy({
        nodeId: 'leaf',
        cwd: '/work',
        fetchLineage: async (opts) => {
          expect(opts.nodeId).toBe('leaf')
          return {
            node: fakeNode({ id: 'leaf', parentNodeId: 'mid', argsJson: '{"reason":"alert"}' }),
            ancestors: [
              fakeNode({ id: 'root', parentNodeId: null, round: 1 }),
              fakeNode({ id: 'mid', parentNodeId: 'root', round: 2 }),
            ],
          }
        },
        resolveConfig: () => ({ serverUrl: 'https://api', orgId: 'o1', apiKey: 'k' }),
      })
    } finally {
      cap.restore()
    }
    expect(code).toBe(0)
    const out = cap.stdout.join('')
    expect(out).toContain('root')
    expect(out).toContain('mid')
    expect(out).toContain('leaf')
    expect(out).toMatch(/inputs/i)
    expect(out).toContain('"reason": "alert"')
    expect(cap.stderr.join('')).toBe('')
  })

  test('surfaces fetchLineage errors to stderr and exits non-zero', async () => {
    const cap = captureStreams()
    let code: number
    try {
      code = await runWhy({
        nodeId: 'missing',
        cwd: '/work',
        fetchLineage: async () => {
          throw new Error('node not found')
        },
        resolveConfig: () => ({ serverUrl: 'https://api', orgId: 'o1', apiKey: 'k' }),
      })
    } finally {
      cap.restore()
    }
    expect(code).not.toBe(0)
    expect(cap.stderr.join('')).toContain('node not found')
  })
})

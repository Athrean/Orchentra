import { describe, expect, test } from 'bun:test'
import type { GraphNodeDto } from '@orchentra/cli-api'
import { runGraph } from '../src/commands/run-graph'

const fakeNode = (overrides: Partial<GraphNodeDto> = {}): GraphNodeDto => ({
  id: 'n1',
  parentNodeId: null,
  kind: 'tool_call',
  integration: 'github',
  round: 1,
  durationMs: 100,
  argsJson: null,
  resultJson: null,
  createdAt: '2026-04-29T00:00:00Z',
  ...overrides,
})

function captureStdio(): {
  out: string[]
  err: string[]
  restore: () => void
} {
  const out: string[] = []
  const err: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((chunk: unknown): boolean => {
    out.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: unknown): boolean => {
    err.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  }) as typeof process.stderr.write
  return {
    out,
    err,
    restore: () => {
      process.stdout.write = origOut
      process.stderr.write = origErr
    },
  }
}

describe('runGraph (verb path)', () => {
  test('renders ASCII tree to stdout when fetch returns nodes', async () => {
    const cap = captureStdio()
    try {
      const code = await runGraph({
        executionId: 'exec-1',
        cwd: '/work',
        deps: {
          fetchGraph: async () => ({
            executionId: 'exec-1',
            nodes: [fakeNode({ id: 'p' }), fakeNode({ id: 'c', parentNodeId: 'p', round: 2 })],
          }),
          resolveConfig: () => ({ serverUrl: 'https://api', orgId: 'o1', apiKey: 'k' }),
        },
      })
      expect(code).toBe(0)
      const text = cap.out.join('')
      expect(text).toContain('exec-1')
      expect(text).toContain('p')
      expect(text).toContain('c')
      expect(text).toMatch(/[├└]/)
    } finally {
      cap.restore()
    }
  })

  test('missing executionId prints usage to stderr and exits non-zero', async () => {
    const cap = captureStdio()
    try {
      const code = await runGraph({ executionId: '', cwd: '/work' })
      expect(code).not.toBe(0)
      expect(cap.err.join('')).toMatch(/usage:.*graph.*<executionId>/)
    } finally {
      cap.restore()
    }
  })

  test('surfaces adapter errors as readable stderr message and exits non-zero', async () => {
    const cap = captureStdio()
    try {
      const code = await runGraph({
        executionId: 'exec-1',
        cwd: '/work',
        deps: {
          fetchGraph: async () => {
            throw new Error('network down')
          },
          resolveConfig: () => ({ serverUrl: '', orgId: '', apiKey: '' }),
        },
      })
      expect(code).not.toBe(0)
      expect(cap.err.join('')).toContain('network down')
    } finally {
      cap.restore()
    }
  })
})

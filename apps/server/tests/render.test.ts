import { describe, expect, test } from 'bun:test'
import type { AgentEvent } from '../src/agent/agent-events'
import { renderAgentEventToFrames, renderAgentEventSequence } from '../src/commands/render'

const CANONICAL_SEQUENCE: AgentEvent[] = [
  { kind: 'agent:started', repo: 'my-org/api', workflow: 'build_test' },
  { kind: 'agent:tool_call', tool: 'get_workflow_logs', args: { owner: 'my-org', repo: 'api', runId: 12345 } },
  { kind: 'agent:tool_result', tool: 'get_workflow_logs', durationMs: 412 },
  { kind: 'agent:tool_call', tool: 'get_commit_changes', args: { owner: 'my-org', repo: 'api', sha: 'abc123' } },
  { kind: 'agent:tool_result', tool: 'get_commit_changes', durationMs: 88 },
  { kind: 'agent:tool_call', tool: 'search_code', args: { owner: 'my-org', repo: 'api', query: 'ECONNRESET' } },
  { kind: 'agent:tool_result', tool: 'search_code', durationMs: 145 },
  { kind: 'agent:synthesis' },
  {
    kind: 'agent:completed',
    failureType: 'dependency_regression',
    confidence: 0.85,
    rootCause: 'undici 6.x default keep-alive triggers ECONNRESET against auth-service.',
  },
]

describe('renderAgentEventToFrames', () => {
  test('renders each event kind with the pretty glyphs', () => {
    expect(renderAgentEventToFrames({ kind: 'agent:started', repo: 'foo/bar', workflow: 'ci' })).toEqual([
      '▸ Investigating foo/bar · ci\n',
    ])
    expect(renderAgentEventToFrames({ kind: 'agent:tool_call', tool: 'get_logs', args: { runId: 99 } })).toEqual([
      '  ↳ get_logs(runId: 99)\n',
    ])
    expect(renderAgentEventToFrames({ kind: 'agent:tool_result', tool: 'get_logs', durationMs: 42 })).toEqual([
      '  ✓ get_logs · 42 ms\n',
    ])
    expect(
      renderAgentEventToFrames({ kind: 'agent:tool_result', tool: 'get_logs', durationMs: 7, isError: true }),
    ).toEqual(['  ✗ get_logs · 7 ms\n'])
    expect(renderAgentEventToFrames({ kind: 'agent:synthesis' })).toEqual(['▸ Synthesizing brief…\n'])
    expect(
      renderAgentEventToFrames({
        kind: 'agent:completed',
        failureType: 'flaky_test',
        confidence: 0.72,
        rootCause: 'race condition in setup hook',
      }),
    ).toEqual(['✓ flaky_test · 72% · race condition in setup hook\n'])
    expect(renderAgentEventToFrames({ kind: 'agent:error', message: 'budget exhausted' })).toEqual([
      '✗ budget exhausted\n',
    ])
  })

  test('plain style swaps unicode glyphs for ASCII', () => {
    const opts = { style: 'plain' as const }
    expect(renderAgentEventToFrames({ kind: 'agent:started', repo: 'foo/bar', workflow: 'ci' }, opts)).toEqual([
      '> Investigating foo/bar · ci\n',
    ])
    expect(renderAgentEventToFrames({ kind: 'agent:tool_call', tool: 'get_logs', args: { runId: 99 } }, opts)).toEqual([
      '  -> get_logs(runId: 99)\n',
    ])
    expect(renderAgentEventToFrames({ kind: 'agent:tool_result', tool: 'get_logs', durationMs: 42 }, opts)).toEqual([
      '  ok get_logs · 42 ms\n',
    ])
    expect(
      renderAgentEventToFrames({ kind: 'agent:tool_result', tool: 'get_logs', durationMs: 7, isError: true }, opts),
    ).toEqual(['  x get_logs · 7 ms\n'])
    expect(renderAgentEventToFrames({ kind: 'agent:error', message: 'oops' }, opts)).toEqual(['x oops\n'])
  })

  test('truncates long string args inside tool_call summaries', () => {
    const long = 'a'.repeat(50)
    const out = renderAgentEventToFrames({ kind: 'agent:tool_call', tool: 'search', args: { query: long } })
    expect(out[0]).toContain('…')
    expect(out[0].length).toBeLessThan(120)
  })

  test('summarises only the first line of a multi-line root cause', () => {
    const out = renderAgentEventToFrames({
      kind: 'agent:completed',
      failureType: 'x',
      confidence: 0.5,
      rootCause: 'first line\nsecond line\nthird line',
    })
    expect(out).toEqual(['✓ x · 50% · first line\n'])
  })

  test('non-scalar arg values render as a placeholder, not JSON dump', () => {
    const out = renderAgentEventToFrames({
      kind: 'agent:tool_call',
      tool: 'do',
      args: { input: { nested: 'value' }, list: [1, 2, 3] },
    })
    expect(out[0]).toBe('  ↳ do(input: …, list: …)\n')
  })

  test('every frame terminates with \\n so SSE consumers flush per frame', () => {
    for (const event of CANONICAL_SEQUENCE) {
      for (const frame of renderAgentEventToFrames(event)) {
        expect(frame.endsWith('\n')).toBe(true)
      }
    }
  })

  test('pure: same event in produces same frames out', () => {
    const event: AgentEvent = { kind: 'agent:tool_call', tool: 't', args: { a: 1 } }
    expect(renderAgentEventToFrames(event)).toEqual(renderAgentEventToFrames(event))
  })
})

describe('renderAgentEventSequence', () => {
  test('canonical investigation sequence matches snapshot', () => {
    const frames = renderAgentEventSequence(CANONICAL_SEQUENCE)
    expect(frames.join('')).toMatchSnapshot()
  })

  test('plain style snapshot for the same canonical sequence', () => {
    const frames = renderAgentEventSequence(CANONICAL_SEQUENCE, { style: 'plain' })
    expect(frames.join('')).toMatchSnapshot()
  })
})

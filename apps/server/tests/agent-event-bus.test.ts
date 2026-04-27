import { describe, expect, test, beforeEach, mock } from 'bun:test'

const broadcastCalls: Array<{ orgId: string; payload: unknown; repo?: string }> = []

mock.module('../src/ws', () => ({
  broadcastToOrg: (orgId: string, payload: unknown, repo?: string) => {
    broadcastCalls.push({ orgId, payload, repo })
  },
}))

import {
  emitAgentEvent,
  getReplay,
  clearReplay,
  REPLAY_MAX_EVENTS,
  REPLAY_MAX_BYTES,
} from '../src/agent/agent-event-bus'
import type { AgentEvent } from '../src/agent/agent-events'

const ORG = 'org-1'
const REPO = 'my-org/api'
const INC = 'inc-1'

function ev(kind: 'agent:tool_call'): AgentEvent {
  return { kind, tool: 't', args: {} }
}

beforeEach(() => {
  clearReplay(INC)
  broadcastCalls.length = 0
})

describe('agent-event-bus replay', () => {
  test('records emitted events for an incident', () => {
    emitAgentEvent({
      incidentId: INC,
      orgId: ORG,
      repo: REPO,
      event: { kind: 'agent:started', repo: REPO, workflow: 'ci' },
    })
    emitAgentEvent({ incidentId: INC, orgId: ORG, repo: REPO, event: { kind: 'agent:synthesis' } })

    const replay = getReplay(INC)
    expect(replay.map((e) => e.event.kind)).toEqual(['agent:started', 'agent:synthesis'])
  })

  test('returns empty array for unknown incident', () => {
    expect(getReplay('does-not-exist')).toEqual([])
  })

  test('clearReplay drops the buffer', () => {
    emitAgentEvent({ incidentId: INC, orgId: ORG, repo: REPO, event: { kind: 'agent:synthesis' } })
    clearReplay(INC)
    expect(getReplay(INC)).toEqual([])
  })

  test('evicts oldest when event count exceeds REPLAY_MAX_EVENTS', () => {
    for (let i = 0; i < REPLAY_MAX_EVENTS + 5; i++) {
      emitAgentEvent({ incidentId: INC, orgId: ORG, repo: REPO, event: ev('agent:tool_call') })
    }
    const replay = getReplay(INC)
    expect(replay.length).toBe(REPLAY_MAX_EVENTS)
  })

  test('evicts oldest when total bytes exceed REPLAY_MAX_BYTES', () => {
    const big = 'x'.repeat(8 * 1024)
    for (let i = 0; i < 10; i++) {
      emitAgentEvent({
        incidentId: INC,
        orgId: ORG,
        repo: REPO,
        event: { kind: 'agent:tool_call', tool: 'big', args: { blob: big } },
      })
    }
    const totalBytes = getReplay(INC).reduce((sum, e) => sum + Buffer.byteLength(JSON.stringify(e), 'utf8'), 0)
    expect(totalBytes).toBeLessThanOrEqual(REPLAY_MAX_BYTES)
  })

  test('replay entries carry incidentId/orgId/repo/timestamp', () => {
    const before = Date.now()
    emitAgentEvent({ incidentId: INC, orgId: ORG, repo: REPO, event: { kind: 'agent:synthesis' } })
    const [entry] = getReplay(INC)
    expect(entry.incidentId).toBe(INC)
    expect(entry.orgId).toBe(ORG)
    expect(entry.repo).toBe(REPO)
    expect(entry.event).toEqual({ kind: 'agent:synthesis' })
    expect(entry.timestamp).toBeGreaterThanOrEqual(before)
  })
})

describe('agent-event-bus fan-out', () => {
  test('emits to broadcastToOrg with repo filter', () => {
    emitAgentEvent({ incidentId: INC, orgId: ORG, repo: REPO, event: { kind: 'agent:synthesis' } })
    expect(broadcastCalls.length).toBe(1)
    expect(broadcastCalls[0].orgId).toBe(ORG)
    expect(broadcastCalls[0].repo).toBe(REPO)
    const payload = broadcastCalls[0].payload as { type: string; incidentId: string; event: AgentEvent }
    expect(payload.type).toBe('agent:event')
    expect(payload.incidentId).toBe(INC)
    expect(payload.event.kind).toBe('agent:synthesis')
  })
})

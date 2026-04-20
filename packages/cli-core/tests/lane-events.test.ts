import { describe, expect, test } from 'bun:test'
import {
  makeLaneEvent,
  laneStarted,
  laneFinished,
  laneBlocked,
  laneFailed,
  laneCommitCreated,
  laneSuperseded,
  isTerminalEvent,
  computeEventFingerprint,
  dedupeTerminalEvents,
  dedupeSupersededCommitEvents,
  LaneEventBuilder,
  withSessionIdentity,
  withOwnership,
  withNudgeId,
  createMetadata,
} from '../src/runtime/lane-events'
import type {
  SessionIdentity,
  LaneOwnership,
  LaneEventBlocker,
  LaneCommitProvenance,
  LaneEvent,
} from '../src/runtime/lane-events'

describe('isTerminalEvent', () => {
  test('detects terminal states', () => {
    expect(isTerminalEvent('lane.finished')).toBe(true)
    expect(isTerminalEvent('lane.failed')).toBe(true)
    expect(isTerminalEvent('lane.superseded')).toBe(true)
    expect(isTerminalEvent('lane.closed')).toBe(true)
    expect(isTerminalEvent('lane.merged')).toBe(true)
  })

  test('non-terminal states return false', () => {
    expect(isTerminalEvent('lane.started')).toBe(false)
    expect(isTerminalEvent('lane.ready')).toBe(false)
    expect(isTerminalEvent('lane.blocked')).toBe(false)
    expect(isTerminalEvent('lane.green')).toBe(false)
    expect(isTerminalEvent('lane.commit.created')).toBe(false)
  })
})

describe('computeEventFingerprint', () => {
  test('is deterministic', () => {
    const fp1 = computeEventFingerprint('lane.finished', 'completed', { commit: 'abc123' })
    const fp2 = computeEventFingerprint('lane.finished', 'completed', { commit: 'abc123' })
    expect(fp1).toBe(fp2)
    expect(fp1.length).toBe(16)
  })

  test('differs for different inputs', () => {
    const fp1 = computeEventFingerprint('lane.finished', 'completed')
    const fp2 = computeEventFingerprint('lane.failed', 'failed')
    const fp3 = computeEventFingerprint('lane.finished', 'completed', { commit: 'abc123' })
    expect(fp1).not.toBe(fp2)
    expect(fp1).not.toBe(fp3)
  })
})

describe('laneBlocked + laneFailed', () => {
  test('blocked event carries blocker details', () => {
    const blocker: LaneEventBlocker = {
      failureClass: 'mcp_startup',
      detail: 'broken server',
    }
    const blocked = laneBlocked('2026-04-04T00:00:00Z', blocker)
    expect(blocked.event).toBe('lane.blocked')
    expect(blocked.status).toBe('blocked')
    expect(blocked.failureClass).toBe('mcp_startup')
    expect(blocked.detail).toBe('broken server')
  })

  test('failed event carries blocker details', () => {
    const blocker: LaneEventBlocker = {
      failureClass: 'trust_gate',
      detail: 'unresolved trust',
    }
    const failed = laneFailed('2026-04-04T00:00:01Z', blocker)
    expect(failed.event).toBe('lane.failed')
    expect(failed.status).toBe('failed')
    expect(failed.failureClass).toBe('trust_gate')
    expect(failed.detail).toBe('unresolved trust')
  })
})

describe('laneCommitCreated', () => {
  test('carries commit provenance', () => {
    const prov: LaneCommitProvenance = {
      commit: 'abc123',
      branch: 'feature/test',
      worktree: 'wt-a',
      canonicalCommit: 'abc123',
      supersededBy: undefined,
      lineage: ['abc123'],
    }
    const event = laneCommitCreated('2026-04-04T00:00:00Z', 'commit created', prov)
    expect(event.event).toBe('lane.commit.created')
    expect(event.status).toBe('completed')
    expect(event.detail).toBe('commit created')
    expect((event.data as LaneCommitProvenance).branch).toBe('feature/test')
  })
})

describe('laneSuperseded', () => {
  test('creates superseded event', () => {
    const prov: LaneCommitProvenance = {
      commit: 'old123',
      branch: 'feature/test',
      lineage: ['old123', 'new456'],
      supersededBy: 'new456',
    }
    const event = laneSuperseded('2026-04-04T00:00:00Z', 'superseded', prov)
    expect(event.event).toBe('lane.superseded')
    expect(event.status).toBe('superseded')
  })
})

describe('laneStarted + laneFinished', () => {
  test('started creates running event', () => {
    const event = laneStarted('2026-04-04T00:00:00Z')
    expect(event.event).toBe('lane.started')
    expect(event.status).toBe('running')
  })

  test('finished creates completed event', () => {
    const event = laneFinished('2026-04-04T00:00:00Z', 'done')
    expect(event.event).toBe('lane.finished')
    expect(event.status).toBe('completed')
    expect(event.detail).toBe('done')
  })

  test('finished without detail', () => {
    const event = laneFinished('2026-04-04T00:00:00Z')
    expect(event.detail).toBeUndefined()
  })
})

describe('dedupeTerminalEvents', () => {
  test('suppresses duplicate terminal events', () => {
    const event1 = new LaneEventBuilder(
      'lane.finished',
      'completed',
      '2026-04-04T00:00:00Z',
      0,
      'live_lane',
    ).buildTerminal()

    const event2 = new LaneEventBuilder('lane.started', 'running', '2026-04-04T00:00:01Z', 1, 'live_lane').build()

    const event3 = new LaneEventBuilder(
      'lane.finished',
      'completed',
      '2026-04-04T00:00:02Z',
      2,
      'live_lane',
    ).buildTerminal()

    const deduped = dedupeTerminalEvents([event1, event2, event3])
    expect(deduped.length).toBe(2)
    expect(deduped[0].event).toBe('lane.finished')
    expect(deduped[1].event).toBe('lane.started')
  })

  test('keeps non-terminal events', () => {
    const events = [makeLaneEvent('lane.started', 'running', 't0'), makeLaneEvent('lane.ready', 'ready', 't1')]
    expect(dedupeTerminalEvents(events).length).toBe(2)
  })
})

describe('dedupeSupersededCommitEvents', () => {
  test('keeps latest commit per canonical key', () => {
    const events: LaneEvent[] = [
      laneCommitCreated('t0', 'old', {
        commit: 'old123',
        branch: 'feature',
        canonicalCommit: 'canon123',
        supersededBy: 'new456',
        lineage: ['old123', 'new456'],
      }),
      laneCommitCreated('t1', 'new', {
        commit: 'new456',
        branch: 'feature',
        canonicalCommit: 'canon123',
        lineage: ['old123', 'new456'],
      }),
    ]

    const result = dedupeSupersededCommitEvents(events)
    expect(result.length).toBe(1)
    expect(result[0].detail).toBe('new')
  })

  test('keeps commits with different canonical keys', () => {
    const events: LaneEvent[] = [
      laneCommitCreated('t0', 'first', {
        commit: 'aaa',
        branch: 'feature',
        canonicalCommit: 'canon-aaa',
        lineage: ['aaa'],
      }),
      laneCommitCreated('t1', 'second', {
        commit: 'bbb',
        branch: 'feature',
        canonicalCommit: 'canon-bbb',
        lineage: ['bbb'],
      }),
    ]

    const result = dedupeSupersededCommitEvents(events)
    expect(result.length).toBe(2)
  })
})

describe('LaneEventBuilder', () => {
  test('builds event with full metadata', () => {
    const identity: SessionIdentity = {
      title: 'test-lane',
      workspace: '/tmp',
      purpose: 'test',
    }
    const ownership: LaneOwnership = {
      owner: 'bot-1',
      workflowScope: 'test-suite',
      watcherAction: 'observe',
    }

    const event = new LaneEventBuilder('lane.started', 'running', '2026-04-04T00:00:00Z', 42, 'test')
      .withSessionIdentity(identity)
      .withOwnership(ownership)
      .withNudgeId('nudge-123')
      .withDetail('starting test run')
      .build()

    expect(event.event).toBe('lane.started')
    expect(event.metadata.seq).toBe(42)
    expect(event.metadata.provenance).toBe('test')
    expect(event.metadata.sessionIdentity?.title).toBe('test-lane')
    expect(event.metadata.ownership?.owner).toBe('bot-1')
    expect(event.metadata.nudgeId).toBe('nudge-123')
    expect(event.detail).toBe('starting test run')
  })

  test('buildTerminal adds fingerprint', () => {
    const event = new LaneEventBuilder('lane.finished', 'completed', 't0', 0, 'live_lane').buildTerminal()
    expect(event.metadata.eventFingerprint).toBeDefined()
    expect(event.metadata.eventFingerprint!.length).toBe(16)
  })
})

describe('metadata helpers', () => {
  test('createMetadata sets seq and provenance', () => {
    const meta = createMetadata(5, 'healthcheck')
    expect(meta.seq).toBe(5)
    expect(meta.provenance).toBe('healthcheck')
    expect(meta.timestampMs).toBeGreaterThan(0)
  })

  test('withSessionIdentity adds identity', () => {
    const meta = createMetadata(0, 'live_lane')
    const identity: SessionIdentity = { title: 't', workspace: '/w', purpose: 'p' }
    const updated = withSessionIdentity(meta, identity)
    expect(updated.sessionIdentity).toEqual(identity)
  })

  test('withOwnership adds ownership', () => {
    const meta = createMetadata(0, 'live_lane')
    const ownership: LaneOwnership = { owner: 'o', workflowScope: 'ws', watcherAction: 'act' }
    const updated = withOwnership(meta, ownership)
    expect(updated.ownership).toEqual(ownership)
  })

  test('withNudgeId adds nudge id', () => {
    const meta = createMetadata(0, 'live_lane')
    const updated = withNudgeId(meta, 'n-123')
    expect(updated.nudgeId).toBe('n-123')
  })
})

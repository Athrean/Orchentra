export type LaneEventName =
  | 'lane.started'
  | 'lane.ready'
  | 'lane.prompt_misdelivery'
  | 'lane.blocked'
  | 'lane.red'
  | 'lane.green'
  | 'lane.commit.created'
  | 'lane.pr.opened'
  | 'lane.merge.ready'
  | 'lane.finished'
  | 'lane.failed'
  | 'lane.reconciled'
  | 'lane.merged'
  | 'lane.superseded'
  | 'lane.closed'
  | 'branch.stale_against_main'
  | 'branch.workspace_mismatch'

export type LaneEventStatus =
  | 'running'
  | 'ready'
  | 'blocked'
  | 'red'
  | 'green'
  | 'completed'
  | 'failed'
  | 'reconciled'
  | 'merged'
  | 'superseded'
  | 'closed'

export type LaneFailureClass =
  | 'prompt_delivery'
  | 'trust_gate'
  | 'branch_divergence'
  | 'compile'
  | 'test'
  | 'plugin_startup'
  | 'mcp_startup'
  | 'mcp_handshake'
  | 'gateway_routing'
  | 'tool_runtime'
  | 'workspace_mismatch'
  | 'infra'

export type EventProvenance = 'live_lane' | 'test' | 'healthcheck' | 'replay' | 'transport'

export type WatcherAction = 'act' | 'observe' | 'ignore'

export interface SessionIdentity {
  title: string
  workspace: string
  purpose: string
  placeholderReason?: string
}

export interface LaneOwnership {
  owner: string
  workflowScope: string
  watcherAction: WatcherAction
}

export interface LaneEventBlocker {
  failureClass: LaneFailureClass
  detail: string
}

export interface LaneCommitProvenance {
  commit: string
  branch: string
  worktree?: string
  canonicalCommit?: string
  supersededBy?: string
  lineage: string[]
}

export interface LaneEventMetadata {
  seq: number
  provenance: EventProvenance
  sessionIdentity?: SessionIdentity
  ownership?: LaneOwnership
  nudgeId?: string
  eventFingerprint?: string
  timestampMs: number
}

export interface LaneEvent {
  event: LaneEventName
  status: LaneEventStatus
  emittedAt: string
  failureClass?: LaneFailureClass
  detail?: string
  data?: unknown
  metadata: LaneEventMetadata
}

function nowMs(): number {
  return Date.now()
}

export function createMetadata(seq: number, provenance: EventProvenance): LaneEventMetadata {
  return {
    seq,
    provenance,
    sessionIdentity: undefined,
    ownership: undefined,
    nudgeId: undefined,
    eventFingerprint: undefined,
    timestampMs: nowMs(),
  }
}

export function withSessionIdentity(meta: LaneEventMetadata, identity: SessionIdentity): LaneEventMetadata {
  return { ...meta, sessionIdentity: identity }
}

export function withOwnership(meta: LaneEventMetadata, ownership: LaneOwnership): LaneEventMetadata {
  return { ...meta, ownership }
}

export function withNudgeId(meta: LaneEventMetadata, nudgeId: string): LaneEventMetadata {
  return { ...meta, nudgeId }
}

export function withFingerprint(meta: LaneEventMetadata, fingerprint: string): LaneEventMetadata {
  return { ...meta, eventFingerprint: fingerprint }
}

export class LaneEventBuilder {
  private builderEvent: LaneEventName
  private builderStatus: LaneEventStatus
  private builderEmittedAt: string
  private builderMetadata: LaneEventMetadata
  private builderDetail?: string
  private builderFailureClass?: LaneFailureClass
  private builderData?: unknown

  constructor(
    event: LaneEventName,
    status: LaneEventStatus,
    emittedAt: string,
    seq: number,
    provenance: EventProvenance,
  ) {
    this.builderEvent = event
    this.builderStatus = status
    this.builderEmittedAt = emittedAt
    this.builderMetadata = createMetadata(seq, provenance)
  }

  withSessionIdentity(identity: SessionIdentity): this {
    this.builderMetadata = withSessionIdentity(this.builderMetadata, identity)
    return this
  }

  withOwnership(ownership: LaneOwnership): this {
    this.builderMetadata = withOwnership(this.builderMetadata, ownership)
    return this
  }

  withNudgeId(nudgeId: string): this {
    this.builderMetadata = withNudgeId(this.builderMetadata, nudgeId)
    return this
  }

  withDetail(detail: string): this {
    this.builderDetail = detail
    return this
  }

  withFailureClass(failureClass: LaneFailureClass): this {
    this.builderFailureClass = failureClass
    return this
  }

  withData(data: unknown): this {
    this.builderData = data
    return this
  }

  buildTerminal(): LaneEvent {
    const fingerprint = computeEventFingerprint(this.builderEvent, this.builderStatus, this.builderData)
    this.builderMetadata = withFingerprint(this.builderMetadata, fingerprint)
    return this.build()
  }

  build(): LaneEvent {
    return {
      event: this.builderEvent,
      status: this.builderStatus,
      emittedAt: this.builderEmittedAt,
      failureClass: this.builderFailureClass,
      detail: this.builderDetail,
      data: this.builderData,
      metadata: this.builderMetadata,
    }
  }
}

export function makeLaneEvent(event: LaneEventName, status: LaneEventStatus, emittedAt: string): LaneEvent {
  return {
    event,
    status,
    emittedAt,
    failureClass: undefined,
    detail: undefined,
    data: undefined,
    metadata: createMetadata(0, 'live_lane'),
  }
}

export function laneStarted(emittedAt: string): LaneEvent {
  return makeLaneEvent('lane.started', 'running', emittedAt)
}

export function laneFinished(emittedAt: string, detail?: string): LaneEvent {
  return { ...makeLaneEvent('lane.finished', 'completed', emittedAt), detail }
}

export function laneBlocked(emittedAt: string, blocker: LaneEventBlocker): LaneEvent {
  return {
    ...makeLaneEvent('lane.blocked', 'blocked', emittedAt),
    failureClass: blocker.failureClass,
    detail: blocker.detail,
  }
}

export function laneFailed(emittedAt: string, blocker: LaneEventBlocker): LaneEvent {
  return {
    ...makeLaneEvent('lane.failed', 'failed', emittedAt),
    failureClass: blocker.failureClass,
    detail: blocker.detail,
  }
}

export function laneCommitCreated(
  emittedAt: string,
  detail: string | undefined,
  provenance: LaneCommitProvenance,
): LaneEvent {
  return {
    ...makeLaneEvent('lane.commit.created', 'completed', emittedAt),
    detail,
    data: provenance,
  }
}

export function laneSuperseded(
  emittedAt: string,
  detail: string | undefined,
  provenance: LaneCommitProvenance,
): LaneEvent {
  return {
    ...makeLaneEvent('lane.superseded', 'superseded', emittedAt),
    detail,
    data: provenance,
  }
}

export function isTerminalEvent(event: LaneEventName): boolean {
  return (
    event === 'lane.finished' ||
    event === 'lane.failed' ||
    event === 'lane.superseded' ||
    event === 'lane.closed' ||
    event === 'lane.merged'
  )
}

function djb2Hash(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash
}

export function computeEventFingerprint(event: LaneEventName, status: LaneEventStatus, data?: unknown): string {
  const parts = `${event}:${status}:${data !== undefined ? JSON.stringify(data) : ''}`
  const h1 = djb2Hash(parts) >>> 0
  const h2 = djb2Hash(parts + ':salt') >>> 0
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

export function dedupeTerminalEvents(events: LaneEvent[]): LaneEvent[] {
  const seenFingerprints = new Set<string>()
  const result: LaneEvent[] = []

  for (const event of events) {
    if (isTerminalEvent(event.event)) {
      const fp = event.metadata.eventFingerprint
      if (fp) {
        if (seenFingerprints.has(fp)) continue
        seenFingerprints.add(fp)
      }
    }
    result.push(event)
  }

  return result
}

export function dedupeSupersededCommitEvents(events: LaneEvent[]): LaneEvent[] {
  const keep = new Array<boolean>(events.length).fill(true)
  const latestByKey = new Map<string, number>()

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.event !== 'lane.commit.created') continue

    const data = event.data as Record<string, unknown> | undefined
    if (!data) continue

    const superseded = typeof data.supersededBy === 'string'
    if (superseded) {
      keep[i] = false
      continue
    }

    const key =
      typeof data.canonicalCommit === 'string'
        ? (data.canonicalCommit as string)
        : typeof data.commit === 'string'
          ? (data.commit as string)
          : null

    if (key !== null) {
      const prev = latestByKey.get(key)
      if (prev !== undefined) {
        keep[prev] = false
      }
      latestByKey.set(key, i)
    }
  }

  return events.filter((_, i) => keep[i])
}

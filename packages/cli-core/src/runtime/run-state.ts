import type { ToolArtifact, ToolEvidence, ToolResultPayload } from './events'

/** States in the long-horizon harness loop. Terminal states never re-enter PLAN. */
export type HarnessState = 'PLAN' | 'EXECUTE' | 'OBSERVE' | 'ASSERT' | 'GATE' | 'EMIT' | 'DONE' | 'QUARANTINE'

/** A claim the harness must prove before a verifiable run can complete. */
export interface VerificationObligation {
  readonly id: string
  readonly description: string
  /** At least one successful evidence item of each kind is required. */
  readonly evidenceKinds: readonly string[]
}

export interface OwnedRunResources {
  readonly processes: readonly string[]
  readonly browserSession: string | null
}

export interface GateTrial {
  readonly index: number
  readonly passed: boolean
  readonly summary: string
  readonly traceId?: string
}

export interface GateDecisionRecord {
  readonly at: string
  readonly outcome: 'pass' | 'assert_failed' | 'gate_failed' | 'quarantined'
  readonly summary: string
  readonly missingObligations: readonly string[]
  readonly trials: readonly GateTrial[]
}

export interface RunRetryCounters {
  readonly assertion: number
  readonly gate: number
  readonly recovery: Readonly<Record<string, number>>
}

/**
 * Durable state for one autonomous objective. Tool ownership, proof, and
 * retry limits live here instead of being split between browser/process code.
 * The shape is deliberately JSON-only so a session event can restore it after
 * an interrupted process.
 */
export interface RunState {
  readonly version: 1
  readonly goal: string
  readonly state: HarnessState
  readonly verificationObligations: readonly VerificationObligation[]
  readonly ownedResources: OwnedRunResources
  readonly evidence: readonly ToolEvidence[]
  readonly artifacts: readonly ToolArtifact[]
  readonly retryCounters: RunRetryCounters
  readonly gateDecisions: readonly GateDecisionRecord[]
  readonly updatedAt: string
}

export function createRunState(
  goal: string,
  verificationObligations: readonly VerificationObligation[] = [],
  at = new Date().toISOString(),
): RunState {
  return {
    version: 1,
    goal,
    state: 'PLAN',
    verificationObligations: verificationObligations.map(copyObligation),
    ownedResources: { processes: [], browserSession: null },
    evidence: [],
    artifacts: [],
    retryCounters: { assertion: 0, gate: 0, recovery: {} },
    gateDecisions: [],
    updatedAt: at,
  }
}

export function isVerifiableRun(state: RunState): boolean {
  return state.verificationObligations.length > 0
}

export function transitionRunState(state: RunState, next: HarnessState, at: string): RunState {
  return { ...state, state: next, updatedAt: at }
}

export function recordToolResult(state: RunState, result: ToolResultPayload, at: string): RunState {
  const evidence = result.isError ? state.evidence : mergeEvidence(state.evidence, result.evidence ?? [])
  const artifacts = result.isError ? state.artifacts : mergeArtifacts(state.artifacts, result.artifacts ?? [])
  const ownedResources = inferOwnedResources(state.ownedResources, result)
  return { ...state, evidence, artifacts, ownedResources, updatedAt: at }
}

export function recordGateDecision(state: RunState, decision: GateDecisionRecord): RunState {
  return {
    ...state,
    gateDecisions: [...state.gateDecisions, copyGateDecision(decision)],
    updatedAt: decision.at,
  }
}

export function incrementRetry(state: RunState, kind: 'assertion' | 'gate' | string, at: string): RunState {
  const retryCounters = state.retryCounters
  if (kind === 'assertion' || kind === 'gate') {
    return {
      ...state,
      retryCounters: { ...retryCounters, [kind]: retryCounters[kind] + 1 },
      updatedAt: at,
    }
  }
  return {
    ...state,
    retryCounters: {
      ...retryCounters,
      recovery: { ...retryCounters.recovery, [kind]: (retryCounters.recovery[kind] ?? 0) + 1 },
    },
    updatedAt: at,
  }
}

/** Defensive restore for session records written by an older or partial process. */
export function restoreRunState(value: unknown): RunState | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (raw.version !== 1 || typeof raw.goal !== 'string' || !isHarnessState(raw.state)) return null
  if (!Array.isArray(raw.verificationObligations) || !Array.isArray(raw.evidence) || !Array.isArray(raw.artifacts))
    return null
  const obligations = raw.verificationObligations.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const entry = item as Record<string, unknown>
    if (typeof entry.id !== 'string' || typeof entry.description !== 'string' || !Array.isArray(entry.evidenceKinds))
      return []
    if (!entry.evidenceKinds.every((kind) => typeof kind === 'string')) return []
    return [{ id: entry.id, description: entry.description, evidenceKinds: entry.evidenceKinds as string[] }]
  })
  if (obligations.length !== raw.verificationObligations.length) return null
  const owned = raw.ownedResources as Record<string, unknown> | undefined
  const retries = raw.retryCounters as Record<string, unknown> | undefined
  if (
    !owned ||
    !Array.isArray(owned.processes) ||
    (owned.browserSession !== null && typeof owned.browserSession !== 'string')
  )
    return null
  if (!retries || typeof retries.assertion !== 'number' || typeof retries.gate !== 'number') return null
  const recovery =
    retries.recovery && typeof retries.recovery === 'object' ? (retries.recovery as Record<string, number>) : {}
  const decisions = Array.isArray(raw.gateDecisions) ? raw.gateDecisions : []
  return {
    version: 1,
    goal: raw.goal,
    state: raw.state,
    verificationObligations: obligations,
    ownedResources: {
      processes: owned.processes.filter((id): id is string => typeof id === 'string'),
      browserSession: owned.browserSession as string | null,
    },
    evidence: raw.evidence as ToolEvidence[],
    artifacts: raw.artifacts as ToolArtifact[],
    retryCounters: { assertion: retries.assertion, gate: retries.gate, recovery },
    gateDecisions: decisions as GateDecisionRecord[],
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  }
}

function copyObligation(obligation: VerificationObligation): VerificationObligation {
  return { ...obligation, evidenceKinds: [...obligation.evidenceKinds] }
}

function copyGateDecision(decision: GateDecisionRecord): GateDecisionRecord {
  return {
    ...decision,
    missingObligations: [...decision.missingObligations],
    trials: decision.trials.map((trial) => ({ ...trial })),
  }
}

function mergeEvidence(existing: readonly ToolEvidence[], incoming: readonly ToolEvidence[]): readonly ToolEvidence[] {
  const out = [...existing]
  for (const item of incoming) {
    const duplicate = out.some((old) => old.kind === item.kind && old.summary === item.summary)
    if (!duplicate) out.push(item)
  }
  return out
}

function mergeArtifacts(existing: readonly ToolArtifact[], incoming: readonly ToolArtifact[]): readonly ToolArtifact[] {
  const out = [...existing]
  for (const item of incoming) {
    if (!out.some((old) => old.uri === item.uri && old.action === item.action)) out.push(item)
  }
  return out
}

function inferOwnedResources(resources: OwnedRunResources, result: ToolResultPayload): OwnedRunResources {
  const processes = [...resources.processes]
  let browserSession = resources.browserSession
  for (const item of result.evidence ?? []) {
    if (item.kind.startsWith('browser-')) browserSession ??= 'active'
    const detail = item.detail
    if (item.kind === 'background-process' && detail && typeof detail === 'object') {
      const id = (detail as Record<string, unknown>).id
      if (typeof id === 'string' && !processes.includes(id)) processes.push(id)
    }
  }
  return { processes, browserSession }
}

function isHarnessState(value: unknown): value is HarnessState {
  return (
    typeof value === 'string' &&
    ['PLAN', 'EXECUTE', 'OBSERVE', 'ASSERT', 'GATE', 'EMIT', 'DONE', 'QUARANTINE'].includes(value)
  )
}

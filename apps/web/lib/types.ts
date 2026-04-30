export interface User {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  email: string | null
}

export interface Org {
  id: string
  name: string
  slug: string
  role: string
}

export interface Repo {
  fullName: string
  owner: string
  name: string
  private: boolean
  description: string | null
  monitored: boolean
}

export interface Incident {
  id: string
  repo: string
  branch: string
  commit: string
  workflowName: string
  commitMessage: string | null
  workflowRunId: number | null
  failedStep: string | null
  status: string
  confidence: number | null
  rootCause: string | null
  triggeredAt: string | null
  createdAt: string
}

export interface IncidentFull extends Incident {
  briefJson: string | null
  suggestedFix: string | null
  resolvedAt: string | null
  mttrSeconds: number | null
  tokenInputs: number | null
  tokenOutputs: number | null
  estimatedCostUsd: number | null
}

export interface ToolCall {
  id: string
  integration: string
  round: number
  durationMs: number | null
  createdAt: string
}

export interface IncidentAction {
  id: string
  actionType: string
  performedBy: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface WorkflowSummary {
  id: number
  name: string
  path: string
  state: string
  latestRunAt: string | null
  latestConclusion: string | null
}

export interface WorkflowRun {
  id: number
  name: string | null
  headBranch: string | null
  headSha: string
  status: string | null
  conclusion: string | null
  runNumber: number
  event: string
  createdAt: string
  updatedAt: string
  htmlUrl: string
  durationSeconds: number | null
}

export interface DailyFailureRate {
  date: string
  total: number
  failed: number
  failureRate: number
}

export interface MttrByWorkflow {
  workflowName: string
  avgMttrSeconds: number
  incidentCount: number
}

export interface TopFailingWorkflow {
  workflowName: string
  repo: string
  failureCount: number
}

export interface FailedStepFrequency {
  failedStep: string
  count: number
}

export interface AnalyticsSummary {
  totalIncidents: number
  resolvedIncidents: number
  avgConfidence: number | null
  resolutionRate: number | null
}

export interface Analytics {
  dailyFailureRate: DailyFailureRate[]
  mttrByWorkflow: MttrByWorkflow[]
  topFailingWorkflows: TopFailingWorkflow[]
  topFailedSteps: FailedStepFrequency[]
  summary: AnalyticsSummary
}

export interface ValidatedRepo {
  fullName: string
  description: string | null
  private: boolean
}

// ── Agent investigation events (issue #110) ─────────────────────────────────

export type AgentEventPayload =
  | { kind: 'agent:started'; repo: string; workflow: string }
  | { kind: 'agent:tool_call'; tool: string; args: Record<string, unknown> }
  | { kind: 'agent:tool_result'; tool: string; durationMs: number; isError?: boolean }
  | { kind: 'agent:synthesis' }
  | { kind: 'agent:completed'; failureType: string; confidence: number; rootCause: string }
  | { kind: 'agent:error'; message: string }

export interface AgentEventEnvelope {
  incidentId: string
  orgId: string
  repo: string
  timestamp: number
  event: AgentEventPayload
}

// ── Execution graph (Phase 4) ────────────────────────────────────────────────

export interface ExecutionMeta {
  id: string
  kind: string
  status: string
  repo: string
  branch: string
  triggeredAt: string | null
  mttrSeconds: number | null
  createdAt: string
}

export interface GraphNode {
  id: string
  parentNodeId: string | null
  kind: string
  integration: string
  round: number
  durationMs: number | null
  argsJson: string | null
  resultJson: string | null
  createdAt: string
}

export interface ExecutionGraph {
  executionId: string
  execution: ExecutionMeta
  nodes: GraphNode[]
}

export interface NodeLineage {
  node: GraphNode
  ancestors: GraphNode[]
}

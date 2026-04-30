// Barrel re-export — consumers import from '../../lib/hooks' unchanged.
// Domain modules live in ./hooks/*, types in ./types, keys in ./queryKeys.

export type {
  User,
  Org,
  Repo,
  Incident,
  IncidentFull,
  ToolCall,
  IncidentAction,
  WorkflowSummary,
  WorkflowRun,
  DailyFailureRate,
  MttrByWorkflow,
  TopFailingWorkflow,
  FailedStepFrequency,
  AnalyticsSummary,
  Analytics,
  ValidatedRepo,
  AgentEventPayload,
  AgentEventEnvelope,
  ExecutionMeta,
  GraphNode,
  ExecutionGraph,
} from './types'

export { queryKeys } from './queryKeys'

export { useMe } from './hooks/useAuth'

export { useMonitorRepo, useValidateRepo, useAvailableRepos } from './hooks/useRepos'

export {
  useIncidents,
  useIncidentDetail,
  useRerunWorkflow,
  useCreateIssue,
  useCreateFixPR,
  useEscalateIncident,
  useSnoozeIncident,
  useDismissIncident,
  useResolveIncident,
} from './hooks/useIncidents'

export { useWorkflows, useWorkflowRuns, useTriggerWorkflow, useCancelRun } from './hooks/useWorkflows'

export { useAnalytics } from './hooks/useAnalytics'

export { useAgentEvents } from './hooks/useAgentEvents'

export { useExecutionGraph } from './hooks/useExecutionGraph'

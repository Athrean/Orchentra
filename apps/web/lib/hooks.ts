'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
// Analytics types
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
// Query keys
// ──────────────────────────────────────────────

export const queryKeys = {
  me: ['me'] as const,
  repos: (orgId: string) => ['repos', orgId] as const,
  incidents: (orgId: string, repo: string, from?: string, to?: string) => ['incidents', orgId, repo, from, to] as const,
  incidentDetail: (orgId: string, id: string) => ['incident', orgId, id] as const,
  chatHistory: (orgId: string, sessionId: string) => ['chat', orgId, sessionId] as const,
  workflows: (orgId: string, repo: string) => ['workflows', orgId, repo] as const,
  workflowRuns: (orgId: string, repo: string, workflowId: number) =>
    ['workflow-runs', orgId, repo, workflowId] as const,
  analytics: (orgId: string, repo: string, from: string, to: string) => ['analytics', orgId, repo, from, to] as const,
}

// ──────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api<{ user: User | null; org: Org | null }>('/api/me'),
  })
}

function useOrgId(): string | undefined {
  const { data } = useMe()
  return data?.org?.id ?? undefined
}

export function useMonitorRepo() {
  const qc = useQueryClient()
  const orgId = useOrgId()
  return useMutation({
    mutationFn: (repo: string) => {
      if (!orgId) throw new Error('No org')
      return api(`/api/orgs/${orgId}/repos/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      })
    },
    onSuccess: () => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: queryKeys.repos(orgId) })
    },
  })
}

export interface ValidatedRepo {
  fullName: string
  description: string | null
  private: boolean
}

export function useValidateRepo() {
  const orgId = useOrgId()
  return useMutation({
    mutationFn: async (input: string): Promise<{ valid: boolean; repo?: ValidatedRepo }> => {
      if (!orgId) throw new Error('No org')
      // Accept full GitHub URLs too
      const match = input.match(/(?:github\.com\/)?([\w.-]+\/[\w.-]+)/)
      const repo = match?.[1] ?? input
      return api<{ valid: boolean; repo?: ValidatedRepo }>(
        `/api/orgs/${orgId}/repos/validate?repo=${encodeURIComponent(repo)}`,
      )
    },
  })
}

export function useAvailableRepos() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: orgId ? queryKeys.repos(orgId) : ['repos'],
    queryFn: () => api<{ repos: Repo[] }>(`/api/orgs/${orgId}/repos/available`).then((d) => d.repos),
    enabled: !!orgId,
  })
}

export function useIncidents(repo: string, from?: string, to?: string) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: orgId ? queryKeys.incidents(orgId, repo, from, to) : ['incidents', repo],
    queryFn: () => {
      const params = new URLSearchParams({ repo })
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      return api<{ incidents: Incident[]; total: number }>(`/api/orgs/${orgId}/incidents?${params}`)
    },
    enabled: !!orgId,
    // SSE handles real-time updates; poll at 5m as a safety net only
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useIncidentDetail(id: string | null) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: orgId && id ? queryKeys.incidentDetail(orgId, id) : ['incident', id],
    queryFn: () =>
      api<{ incident: IncidentFull; toolCalls: ToolCall[]; actions: IncidentAction[] }>(
        `/api/orgs/${orgId}/incidents/${id}`,
      ),
    enabled: !!id && !!orgId,
  })
}

// ──────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────

export function useRerunWorkflow(repo: string) {
  const qc = useQueryClient()
  const orgId = useOrgId()
  return useMutation({
    mutationFn: (incidentId: string) => {
      if (!orgId) throw new Error('No org')
      return api<{ runUrl: string }>(`/api/orgs/${orgId}/incidents/${incidentId}/rerun`, { method: 'POST' })
    },
    onSuccess: (_, incidentId) => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: ['incidents', orgId, repo] })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(orgId, incidentId) })
    },
  })
}

export function useCreateIssue(repo: string) {
  const qc = useQueryClient()
  const orgId = useOrgId()
  return useMutation({
    mutationFn: (incidentId: string) => {
      if (!orgId) throw new Error('No org')
      return api<{ issueUrl: string; issueNumber?: number }>(`/api/orgs/${orgId}/incidents/${incidentId}/issue`, {
        method: 'POST',
      })
    },
    onSuccess: (_, incidentId) => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: ['incidents', orgId, repo] })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(orgId, incidentId) })
    },
  })
}

export function useCreateFixPR(repo: string) {
  const qc = useQueryClient()
  const orgId = useOrgId()
  return useMutation({
    mutationFn: (incidentId: string) => {
      if (!orgId) throw new Error('No org')
      return api<{ prUrl: string; prNumber?: number }>(`/api/orgs/${orgId}/incidents/${incidentId}/fix-pr`, {
        method: 'POST',
      })
    },
    onSuccess: (_, incidentId) => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: ['incidents', orgId, repo] })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(orgId, incidentId) })
    },
  })
}

export function useEscalateIncident(repo: string) {
  const qc = useQueryClient()
  const orgId = useOrgId()
  return useMutation({
    mutationFn: (incidentId: string) => {
      if (!orgId) throw new Error('No org')
      return api(`/api/orgs/${orgId}/incidents/${incidentId}/escalate`, { method: 'POST' })
    },
    onSuccess: (_, incidentId) => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: ['incidents', orgId, repo] })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(orgId, incidentId) })
    },
  })
}

export function useSnoozeIncident(repo: string) {
  const qc = useQueryClient()
  const orgId = useOrgId()
  return useMutation({
    mutationFn: ({ incidentId, hours }: { incidentId: string; hours: number }) => {
      if (!orgId) throw new Error('No org')
      return api(`/api/orgs/${orgId}/incidents/${incidentId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      })
    },
    onSuccess: (_, { incidentId }) => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: ['incidents', orgId, repo] })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(orgId, incidentId) })
    },
  })
}

export function useDismissIncident(repo: string) {
  const qc = useQueryClient()
  const orgId = useOrgId()
  return useMutation({
    mutationFn: (incidentId: string) => {
      if (!orgId) throw new Error('No org')
      return api(`/api/orgs/${orgId}/incidents/${incidentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      })
    },
    onSuccess: (_, incidentId) => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: ['incidents', orgId, repo] })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(orgId, incidentId) })
    },
  })
}

export function useResolveIncident(repo: string) {
  const qc = useQueryClient()
  const orgId = useOrgId()
  return useMutation({
    mutationFn: (incidentId: string) => {
      if (!orgId) throw new Error('No org')
      return api(`/api/orgs/${orgId}/incidents/${incidentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      })
    },
    onSuccess: (_, incidentId) => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: ['incidents', orgId, repo] })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(orgId, incidentId) })
    },
  })
}

export interface ChatHistoryMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

/** Load persisted chat history for a session from the server. */
export function useChatHistory(sessionId: string | null) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: orgId && sessionId ? queryKeys.chatHistory(orgId, sessionId) : ['chat', sessionId],
    queryFn: () =>
      api<{ messages: ChatHistoryMessage[] }>(
        `/api/orgs/${orgId}/chat/history?sessionId=${encodeURIComponent(sessionId!)}`,
      ),
    enabled: !!orgId && !!sessionId,
    staleTime: Infinity, // history doesn't change after a session ends
  })
}

// ──────────────────────────────────────────────
// Workflow hooks
// ──────────────────────────────────────────────

export function useWorkflows(repo: string) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: orgId ? queryKeys.workflows(orgId, repo) : ['workflows', repo],
    queryFn: () =>
      api<{ workflows: WorkflowSummary[] }>(`/api/orgs/${orgId}/workflows?repo=${encodeURIComponent(repo)}`).then(
        (d) => d.workflows,
      ),
    enabled: !!orgId,
    refetchInterval: 60_000,
  })
}

export function useWorkflowRuns(repo: string, workflowId: number | null) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: orgId && workflowId ? queryKeys.workflowRuns(orgId, repo, workflowId) : ['workflow-runs', repo],
    queryFn: () =>
      api<{ runs: WorkflowRun[] }>(
        `/api/orgs/${orgId}/workflows/${workflowId}/runs?repo=${encodeURIComponent(repo)}`,
      ).then((d) => d.runs),
    enabled: !!orgId && !!workflowId,
  })
}

export function useTriggerWorkflow(repo: string) {
  const qc = useQueryClient()
  const orgId = useOrgId()
  return useMutation({
    mutationFn: ({ workflowId, ref, inputs }: { workflowId: number; ref: string; inputs?: Record<string, string> }) => {
      if (!orgId) throw new Error('No org')
      return api(`/api/orgs/${orgId}/workflows/${workflowId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, ref, inputs }),
      })
    },
    onSuccess: (_data, { workflowId }) => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: queryKeys.workflows(orgId, repo) })
      qc.invalidateQueries({ queryKey: queryKeys.workflowRuns(orgId, repo, workflowId) })
    },
  })
}

export function useCancelRun(repo: string) {
  const qc = useQueryClient()
  const orgId = useOrgId()
  return useMutation({
    mutationFn: (runId: number) => {
      if (!orgId) throw new Error('No org')
      return api(`/api/orgs/${orgId}/workflows/runs/${runId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      })
    },
    onSuccess: () => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: queryKeys.workflows(orgId, repo) })
      qc.invalidateQueries({ queryKey: ['workflow-runs', orgId, repo] })
    },
  })
}

// ──────────────────────────────────────────────
// Analytics hook
// ──────────────────────────────────────────────

/**
 * Fetch aggregated CI/CD health metrics.
 * Defaults to the last 30 days if from/to are not provided.
 */
export function useAnalytics(repo: string, from?: string, to?: string) {
  const orgId = useOrgId()
  const toStr = to ?? new Date().toISOString().slice(0, 10)
  const fromStr = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return useQuery({
    queryKey: orgId ? queryKeys.analytics(orgId, repo, fromStr, toStr) : ['analytics', repo],
    queryFn: () => {
      const params = new URLSearchParams({ from: fromStr, to: toStr })
      if (repo) params.set('repo', repo)
      return api<Analytics>(`/api/orgs/${orgId}/analytics?${params}`)
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })
}

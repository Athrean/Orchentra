'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from '../queryKeys'
import type { WorkflowSummary, WorkflowRun } from '../types'
import { useOrgId } from './useAuth'

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

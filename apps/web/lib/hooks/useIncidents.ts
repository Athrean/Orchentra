'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from '../queryKeys'
import type { Incident, IncidentFull, ToolCall, IncidentAction } from '../types'
import { useOrgId } from './useAuth'

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

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {} from 'react'
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

// ──────────────────────────────────────────────
// Query keys
// ──────────────────────────────────────────────

export const queryKeys = {
  me: ['me'] as const,
  repos: (orgId: string) => ['repos', orgId] as const,
  incidents: (orgId: string, repo: string, from?: string, to?: string) => ['incidents', orgId, repo, from, to] as const,
  incidentDetail: (orgId: string, id: string) => ['incident', orgId, id] as const,
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

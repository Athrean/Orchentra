'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
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
  incidents: (orgId: string, repo: string) => ['incidents', orgId, repo] as const,
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

export function useAvailableRepos() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: orgId ? queryKeys.repos(orgId) : ['repos'],
    queryFn: () => api<{ repos: Repo[] }>(`/api/orgs/${orgId}/repos/available`).then((d) => d.repos),
    enabled: !!orgId,
  })
}

export function useIncidents(repo: string) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: orgId ? queryKeys.incidents(orgId, repo) : ['incidents', repo],
    queryFn: () =>
      api<{ incidents: Incident[]; total: number }>(`/api/orgs/${orgId}/incidents?repo=${encodeURIComponent(repo)}`),
    enabled: !!orgId,
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
      qc.invalidateQueries({ queryKey: queryKeys.incidents(orgId, repo) })
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
      qc.invalidateQueries({ queryKey: queryKeys.incidents(orgId, repo) })
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
      qc.invalidateQueries({ queryKey: queryKeys.incidents(orgId, repo) })
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
      qc.invalidateQueries({ queryKey: queryKeys.incidents(orgId, repo) })
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
      qc.invalidateQueries({ queryKey: queryKeys.incidents(orgId, repo) })
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
      qc.invalidateQueries({ queryKey: queryKeys.incidents(orgId, repo) })
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
      qc.invalidateQueries({ queryKey: queryKeys.incidents(orgId, repo) })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(orgId, incidentId) })
    },
  })
}

// ──────────────────────────────────────────────
// SSE — real-time incident updates
// ──────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export function useIncidentSSE(repo: string) {
  const qc = useQueryClient()
  const orgId = useOrgId()
  const sourceRef = useRef<EventSource | null>(null)
  const errorCountRef = useRef(0)

  useEffect(() => {
    if (!orgId) return

    const url = `${API_BASE}/api/orgs/${orgId}/incidents/stream?repo=${encodeURIComponent(repo)}`
    const source = new EventSource(url, { withCredentials: true })
    sourceRef.current = source
    errorCountRef.current = 0

    // Server sends data-only SSE (no event: field), so all events arrive as 'message'.
    // Route by parsed type from the JSON payload.
    source.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data)
        const type: string = data.type ?? ''

        if (type === 'incident:created' || type === 'incident:updated' || type === 'incident:status_changed') {
          qc.invalidateQueries({ queryKey: queryKeys.incidents(orgId, repo) })
          if (data.incidentId) {
            qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(orgId, data.incidentId) })
          }
        }
      } catch {
        /* SSE data parse is best-effort */
      }
    })

    source.onerror = () => {
      errorCountRef.current++
      // Close after repeated failures to prevent infinite retry loops
      if (errorCountRef.current > 5) {
        source.close()
      }
    }

    return () => {
      source.close()
      sourceRef.current = null
    }
  }, [repo, orgId, qc])
}

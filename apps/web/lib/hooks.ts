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
  repos: ['repos'] as const,
  incidents: (repo: string) => ['incidents', repo] as const,
  incidentDetail: (id: string) => ['incident', id] as const,
}

// ──────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api<{ user: User | null }>('/api/me').then((d) => d.user),
  })
}

export function useAvailableRepos() {
  return useQuery({
    queryKey: queryKeys.repos,
    queryFn: () => api<{ repos: Repo[] }>('/api/repos/available').then((d) => d.repos),
  })
}

export function useIncidents(repo: string) {
  return useQuery({
    queryKey: queryKeys.incidents(repo),
    queryFn: () => api<{ incidents: Incident[]; total: number }>(`/api/incidents?repo=${encodeURIComponent(repo)}`),
  })
}

export function useIncidentDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.incidentDetail(id!),
    queryFn: () =>
      api<{ incident: IncidentFull; toolCalls: ToolCall[]; actions: IncidentAction[] }>(`/api/incidents/${id}`),
    enabled: !!id,
  })
}

// ──────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────

export function useRerunWorkflow(repo: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (incidentId: string) =>
      api<{ runUrl: string }>(`/api/incidents/${incidentId}/rerun`, { method: 'POST' }),
    onSuccess: (_, incidentId) => {
      qc.invalidateQueries({ queryKey: queryKeys.incidents(repo) })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(incidentId) })
    },
  })
}

export function useCreateIssue(repo: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (incidentId: string) =>
      api<{ issueUrl: string; issueNumber?: number }>(`/api/incidents/${incidentId}/issue`, {
        method: 'POST',
      }),
    onSuccess: (_, incidentId) => {
      qc.invalidateQueries({ queryKey: queryKeys.incidents(repo) })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(incidentId) })
    },
  })
}

export function useCreateFixPR(repo: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (incidentId: string) =>
      api<{ prUrl: string; prNumber?: number }>(`/api/incidents/${incidentId}/fix-pr`, {
        method: 'POST',
      }),
    onSuccess: (_, incidentId) => {
      qc.invalidateQueries({ queryKey: queryKeys.incidents(repo) })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(incidentId) })
    },
  })
}

export function useEscalateIncident(repo: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (incidentId: string) => api(`/api/incidents/${incidentId}/escalate`, { method: 'POST' }),
    onSuccess: (_, incidentId) => {
      qc.invalidateQueries({ queryKey: queryKeys.incidents(repo) })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(incidentId) })
    },
  })
}

export function useSnoozeIncident(repo: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ incidentId, hours }: { incidentId: string; hours: number }) =>
      api(`/api/incidents/${incidentId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      }),
    onSuccess: (_, { incidentId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.incidents(repo) })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(incidentId) })
    },
  })
}

export function useDismissIncident(repo: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (incidentId: string) =>
      api(`/api/incidents/${incidentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      }),
    onSuccess: (_, incidentId) => {
      qc.invalidateQueries({ queryKey: queryKeys.incidents(repo) })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(incidentId) })
    },
  })
}

export function useResolveIncident(repo: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (incidentId: string) =>
      api(`/api/incidents/${incidentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      }),
    onSuccess: (_, incidentId) => {
      qc.invalidateQueries({ queryKey: queryKeys.incidents(repo) })
      qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(incidentId) })
    },
  })
}

// ──────────────────────────────────────────────
// SSE — real-time incident updates
// ──────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export function useIncidentSSE(repo: string) {
  const qc = useQueryClient()
  const sourceRef = useRef<EventSource | null>(null)
  const errorCountRef = useRef(0)

  useEffect(() => {
    const url = `${API_BASE}/api/incidents/stream?repo=${encodeURIComponent(repo)}`
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
          qc.invalidateQueries({ queryKey: queryKeys.incidents(repo) })
          if (data.incidentId) {
            qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(data.incidentId) })
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
  }, [repo, qc])
}

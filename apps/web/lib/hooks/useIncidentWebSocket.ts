'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export type WsIncidentEventType =
  | 'incident:created'
  | 'incident:updated'
  | 'incident:status_changed'
  | 'incident:action'

export interface WsIncidentEvent {
  type: WsIncidentEventType
  incidentId: string
  orgId: string
  repo: string
  data?: Record<string, unknown>
}

const WS_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/^http/, 'ws')

const BACKOFF_INITIAL_MS = 100
const BACKOFF_MAX_MS = 30_000
const BACKOFF_MULTIPLIER = 2

/** Shared query key helpers — mirrors the shape used in hooks.ts */
const queryKeys = {
  incidents: (orgId: string, repo: string) => ['incidents', orgId, repo] as const,
  incidentDetail: (orgId: string, id: string) => ['incident', orgId, id] as const,
}

/**
 * Opens a WebSocket connection to `/ws/orgs/:orgId?repo=...` and invalidates
 * React Query caches on every incident event.
 *
 * Reconnects automatically with exponential backoff (100ms → 30s cap).
 * Cleans up on unmount.
 *
 * Uses stable refs for mutable state so the effect only re-runs when
 * orgId or repo actually change — not on every render.
 */
/** Returns a stable ref to the active WebSocket so callers can read readyState for UI indicators. */
export function useIncidentWebSocket(orgId: string | undefined, repo: string): RefObject<WebSocket | null> {
  const qc = useQueryClient()

  // Stable refs — mutations to these never trigger re-renders
  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef(BACKOFF_INITIAL_MS)
  const unmountedRef = useRef(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep latest orgId/repo/qc accessible inside long-lived closures without re-creating them
  const orgIdRef = useRef(orgId)
  const repoRef = useRef(repo)
  orgIdRef.current = orgId
  repoRef.current = repo

  useEffect(() => {
    if (!orgId) return
    unmountedRef.current = false
    backoffRef.current = BACKOFF_INITIAL_MS

    function scheduleReconnect(): void {
      if (unmountedRef.current) return
      const delay = backoffRef.current
      backoffRef.current = Math.min(backoffRef.current * BACKOFF_MULTIPLIER, BACKOFF_MAX_MS)
      retryTimerRef.current = setTimeout(openConnection, delay)
    }

    function openConnection(): void {
      if (!orgIdRef.current || unmountedRef.current) return

      const url = `${WS_BASE}/ws/orgs/${orgIdRef.current}?repo=${encodeURIComponent(repoRef.current)}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        backoffRef.current = BACKOFF_INITIAL_MS
      }

      ws.onmessage = (e) => {
        const currentOrgId = orgIdRef.current
        const currentRepo = repoRef.current
        if (!currentOrgId) return
        try {
          const data: WsIncidentEvent = JSON.parse(e.data as string)
          qc.invalidateQueries({ queryKey: queryKeys.incidents(currentOrgId, currentRepo) })
          if (data.incidentId) {
            qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(currentOrgId, data.incidentId) })
          }
        } catch {
          /* parse errors are best-effort */
        }
      }

      ws.onclose = () => {
        if (unmountedRef.current) return
        scheduleReconnect()
      }

      ws.onerror = () => {
        // onclose fires after onerror — reconnect is handled there
      }
    }

    openConnection()

    return () => {
      unmountedRef.current = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orgId and repo trigger reconnect; qc is stable
  }, [orgId, repo])

  return wsRef
}

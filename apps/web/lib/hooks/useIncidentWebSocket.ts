'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys, type Incident, type IncidentFull } from '../hooks'

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

export interface WsHandle {
  /** Ref to the live WebSocket — null during backoff window or after unmount. */
  wsRef: RefObject<WebSocket | null>
  /**
   * True while a reconnect timer is scheduled (backoff window).
   * Lets the status badge distinguish "null because reconnecting" from "null because offline".
   */
  reconnectingRef: RefObject<boolean>
}

const WS_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/^http/, 'ws')

const BACKOFF_INITIAL_MS = 100
const BACKOFF_MAX_MS = 30_000
const BACKOFF_MULTIPLIER = 2

/**
 * Opens a WebSocket connection to `/ws/orgs/:orgId?repo=...` and invalidates
 * React Query caches on every incident event.
 *
 * Returns a `WsHandle` with:
 * - `wsRef` — the active WebSocket, null during backoff window or after unmount
 * - `reconnectingRef` — true while a retry timer is pending so callers can distinguish
 *   "offline and retrying" from "permanently disconnected"
 *
 * Uses stable refs so the effect only re-runs when orgId or repo actually change.
 */
export function useIncidentWebSocket(orgId: string | undefined, repo: string): WsHandle {
  const qc = useQueryClient()

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectingRef = useRef(false)
  const backoffRef = useRef(BACKOFF_INITIAL_MS)
  const unmountedRef = useRef(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
      reconnectingRef.current = true
      const delay = backoffRef.current
      backoffRef.current = Math.min(backoffRef.current * BACKOFF_MULTIPLIER, BACKOFF_MAX_MS)
      retryTimerRef.current = setTimeout(openConnection, delay)
    }

    function openConnection(): void {
      if (!orgIdRef.current || unmountedRef.current) return
      reconnectingRef.current = false

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
          const data: (WsIncidentEvent | { type: 'ping' }) & { type: string } = JSON.parse(e.data as string)

          // Respond to server ping immediately to keep the connection alive
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
            return
          }

          const event = data as WsIncidentEvent
          const hasStatus = event.data && typeof event.data.status === 'string'

          if (hasStatus && (event.type === 'incident:updated' || event.type === 'incident:status_changed')) {
            const newStatus = event.data!.status as string

            // Patch the incidents list cache — instant UI update
            qc.setQueryData(
              queryKeys.incidents(currentOrgId, currentRepo),
              (old: { incidents: Incident[]; total: number } | undefined) => {
                if (!old) return old
                return {
                  ...old,
                  incidents: old.incidents.map((inc) =>
                    inc.id === event.incidentId ? { ...inc, status: newStatus } : inc,
                  ),
                }
              },
            )

            // Patch the incident detail cache if loaded
            if (event.incidentId) {
              qc.setQueryData(
                queryKeys.incidentDetail(currentOrgId, event.incidentId),
                (old: { incident: IncidentFull; toolCalls: unknown[]; actions: unknown[] } | undefined) => {
                  if (!old) return old
                  return { ...old, incident: { ...old.incident, status: newStatus } }
                },
              )
            }

            // Background refetch for full consistency — no loading spinner
            qc.refetchQueries({ queryKey: queryKeys.incidents(currentOrgId, currentRepo) })
            if (event.incidentId) {
              qc.refetchQueries({ queryKey: queryKeys.incidentDetail(currentOrgId, event.incidentId) })
            }
          } else {
            // incident:created, incident:action, and other events — full invalidate
            qc.invalidateQueries({ queryKey: queryKeys.incidents(currentOrgId, currentRepo) })
            if (event.incidentId) {
              qc.invalidateQueries({ queryKey: queryKeys.incidentDetail(currentOrgId, event.incidentId) })
            }
          }
        } catch {
          /* parse errors are best-effort */
        }
      }

      ws.onclose = () => {
        if (unmountedRef.current) return
        // Guard against stale closure: if orgId/repo changed, cleanup already nulled wsRef
        // and the new effect opened a fresh socket. Prevent this old onclose from triggering
        // a spurious reconnect that would orphan the new legitimate connection.
        if (ws !== wsRef.current) return
        wsRef.current = null
        scheduleReconnect()
      }

      ws.onerror = () => {
        // onclose always fires after onerror — reconnect handled there
      }
    }

    openConnection()

    return () => {
      unmountedRef.current = true
      reconnectingRef.current = false
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orgId and repo trigger reconnect; qc is stable
  }, [orgId, repo])

  return { wsRef, reconnectingRef }
}

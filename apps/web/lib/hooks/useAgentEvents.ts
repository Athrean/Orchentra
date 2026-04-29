'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from '../queryKeys'
import type { AgentEventEnvelope } from '../types'
import { useOrgId } from './useAuth'

/**
 * Fetches the replay buffer of agent events for an incident.
 *
 * The buffer is bounded server-side (last 20 events / 32KB). Live updates
 * come through the WebSocket — this hook seeds the cache on mount; the
 * WS handler appends new events to the same query cache.
 */
export function useAgentEvents(incidentId: string | null): {
  events: AgentEventEnvelope[]
  isLoading: boolean
} {
  const orgId = useOrgId()
  const enabled = Boolean(orgId && incidentId)

  const query = useQuery({
    queryKey: enabled ? queryKeys.agentEvents(orgId!, incidentId!) : ['agent-events', incidentId],
    queryFn: () => api<{ events: AgentEventEnvelope[] }>(`/api/orgs/${orgId}/incidents/${incidentId}/agent-events`),
    enabled,
    staleTime: Infinity,
  })

  return { events: query.data?.events ?? [], isLoading: query.isLoading }
}

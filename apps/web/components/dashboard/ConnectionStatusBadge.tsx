'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

export type WsConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

interface Props {
  state: WsConnectionState
}

const STATE_CONFIG: Record<WsConnectionState, { label: string; dot: string }> = {
  connecting: { label: 'Connecting', dot: 'bg-yellow-500 animate-pulse' },
  connected: { label: 'Live', dot: 'bg-green-500' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-yellow-500 animate-pulse' },
  disconnected: { label: 'Offline', dot: 'bg-red-500' },
}

export function ConnectionStatusBadge({ state }: Props) {
  const { label, dot } = STATE_CONFIG[state]

  return (
    <div className={cn('flex items-center gap-1.5 text-xs', 'text-[var(--color-text-muted)]')}>
      <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', dot)} />
      <span>{label}</span>
    </div>
  )
}

/**
 * Hook that tracks WebSocket state transitions and exposes WsConnectionState.
 * Companion to useIncidentWebSocket — pass the same ws ref.
 */
export function useWsConnectionState(wsRef: React.RefObject<WebSocket | null>): WsConnectionState {
  const [state, setState] = useState<WsConnectionState>('connecting')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    function poll() {
      const ws = wsRef.current
      if (!ws) {
        setState('disconnected')
        return
      }
      switch (ws.readyState) {
        case WebSocket.CONNECTING:
          setState('connecting')
          break
        case WebSocket.OPEN:
          setState('connected')
          break
        case WebSocket.CLOSING:
        case WebSocket.CLOSED:
          setState('reconnecting')
          break
      }
    }

    intervalRef.current = setInterval(poll, 1_000)
    poll()

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [wsRef])

  return state
}

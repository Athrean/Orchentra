import type { ServerWebSocket } from 'bun'
import { validateSession, SESSION_COOKIE_NAME } from './auth/session'
import { db, orgMembers } from './db/client'
import { eq, and } from 'drizzle-orm'

const ALLOWED_ORIGIN = Bun.env.FRONTEND_URL ?? 'http://localhost:3000'

export interface WsData {
  orgId: string
  userId: string
  repo?: string
  /** Unix ms of the last pong received. Set to Date.now() on connect so the
   *  first ping interval doesn't immediately evict a freshly-connected client. */
  lastPongAt: number
}

/**
 * Registry of all connected WebSocket clients keyed by orgId.
 * Each org has its own Set so broadcasts are O(org-members) not O(all-clients).
 */
const clientsByOrg = new Map<string, Set<ServerWebSocket<WsData>>>()

export function registerWsClient(ws: ServerWebSocket<WsData>): void {
  const { orgId } = ws.data
  if (!clientsByOrg.has(orgId)) clientsByOrg.set(orgId, new Set())
  clientsByOrg.get(orgId)!.add(ws)
}

export function unregisterWsClient(ws: ServerWebSocket<WsData>): void {
  const { orgId } = ws.data
  const clients = clientsByOrg.get(orgId)
  if (!clients) return
  clients.delete(ws)
  if (clients.size === 0) clientsByOrg.delete(orgId)
}

/**
 * Broadcast a JSON payload to all WebSocket clients in an org.
 * Optionally filter to a specific repo if the client subscribed to one.
 */
export function broadcastToOrg(orgId: string, payload: unknown, repo?: string): void {
  const clients = clientsByOrg.get(orgId)
  if (!clients) return

  const message = JSON.stringify(payload)

  for (const ws of clients) {
    if (repo && ws.data.repo && ws.data.repo !== repo) continue
    try {
      ws.send(message)
    } catch {
      // Dead socket — unregister lazily; onclose will fire and clean up
    }
  }
}

/**
 * Authenticate a WebSocket upgrade request.
 * Returns WsData on success or null to reject the upgrade.
 * Reads session cookie from the Upgrade request headers.
 */
export async function authenticateWsUpgrade(req: Request, orgId: string): Promise<WsData | null> {
  // Reject cross-origin upgrade requests
  const origin = req.headers.get('Origin')
  if (origin && origin !== ALLOWED_ORIGIN) return null

  const cookieHeader = req.headers.get('Cookie') ?? ''
  const sessionId = parseCookie(cookieHeader, SESSION_COOKIE_NAME)
  if (!sessionId) return null

  const result = await validateSession(sessionId)
  if (!result) return null

  const [membership] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, result.user.id)))
    .limit(1)

  if (!membership) return null

  const url = new URL(req.url)
  const repo = url.searchParams.get('repo')?.toLowerCase() ?? undefined

  return { orgId, userId: result.user.id, repo, lastPongAt: Date.now() }
}

/** Returns total number of connected WebSocket clients across all orgs. */
export function getWsClientCount(): number {
  let total = 0
  for (const set of clientsByOrg.values()) total += set.size
  return total
}

function parseCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const k = trimmed.slice(0, eqIdx)
    const v = trimmed.slice(eqIdx + 1) // preserve all '=' in value (e.g. base64-encoded tokens)
    if (k === name) return decodeURIComponent(v)
  }
  return undefined
}

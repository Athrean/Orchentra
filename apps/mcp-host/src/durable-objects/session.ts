/**
 * Per-org session storage. Holds approval state and transient session
 * metadata so per-request approval lookups don't have to round-trip a
 * database for every MCP call.
 *
 * Phase 1B scaffold: stores a tiny in-memory allowlist of `<orgId, opId>`
 * pairs that have been pre-approved. Real persistence (DO storage,
 * R2-backed audit log, etc.) lands in Phase 1C.
 *
 * TODO(phase-1b-prod): persist approvals to Durable Object storage so
 * pre-approvals survive restarts; expose a write endpoint for ops admins
 * to grant/revoke per-op approvals.
 */
export class OrgSession {
  private state: DurableObjectState
  private approvedOps = new Set<string>()

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'POST' && url.pathname === '/approve') {
      const body = (await req.json()) as { opId?: string }
      if (typeof body.opId !== 'string' || body.opId.length === 0) {
        return new Response(JSON.stringify({ ok: false, error: 'opId required' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      }
      this.approvedOps.add(body.opId)
      await this.state.storage.put('approvedOps', Array.from(this.approvedOps))
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      })
    }

    if (req.method === 'GET' && url.pathname === '/check') {
      const opId = url.searchParams.get('opId') ?? ''
      const approved = opId.length > 0 && this.approvedOps.has(opId)
      return new Response(JSON.stringify({ approved }), {
        headers: { 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }
}

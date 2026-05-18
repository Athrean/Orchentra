import { Hono } from 'hono'
import { HandoffDuplicateStateError, type InstallHandoffStore } from '../github/install-handoff-memory-store'

export interface InstallHandoffRouterDeps {
  readonly store: InstallHandoffStore
}

const LOOPBACK_REDIRECT = /^http:\/\/127\.0\.0\.1:\d+\/install-cb$/
const MIN_STATE_LEN = 32

export function createInstallHandoffRouter(deps: InstallHandoffRouterDeps): Hono {
  const router = new Hono()

  router.post('/start', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid_json' }, 400)
    }
    if (typeof body !== 'object' || body === null) return c.json({ error: 'invalid_body' }, 400)
    const { state, redirectUri } = body as { state?: unknown; redirectUri?: unknown }
    if (typeof state !== 'string' || state.length < MIN_STATE_LEN) {
      return c.json({ error: 'state_too_short' }, 400)
    }
    if (typeof redirectUri !== 'string' || !LOOPBACK_REDIRECT.test(redirectUri)) {
      return c.json({ error: 'redirect_uri_not_loopback' }, 400)
    }
    try {
      deps.store.start({ state, redirectUri })
    } catch (err) {
      if (err instanceof HandoffDuplicateStateError) {
        return c.json({ error: 'state_in_use' }, 409)
      }
      throw err
    }
    return c.json({ ok: true }, 200)
  })

  return router
}

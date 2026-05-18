import { Hono } from 'hono'
import { getInstallationByOwnerCaseInsensitive } from '../github/installations'

/**
 * Anonymous read of GitHub App installation state by owner. The CLI bootstrap
 * orchestrator hits this before opening a browser to decide between an
 * install/new URL (404) and the configure URL of an existing installation
 * (200). Treating the result as public is safe: GitHub already exposes which
 * apps are installed on public orgs through its UI.
 *
 * Owner matching is case-insensitive — GH renders org names canonical-cased
 * in browser, but git remotes sometimes echo back lowercase or mixed-case
 * variants. We canonicalize at the boundary.
 */

const OWNER_PATTERN = /^[A-Za-z0-9-]{1,39}$/

export function createInstallationsRouter(): Hono {
  const router = new Hono()

  router.get('/by-owner/:owner', async (c) => {
    const owner = c.req.param('owner')
    if (!OWNER_PATTERN.test(owner)) return c.json({ error: 'invalid_owner' }, 400)
    const row = await getInstallationByOwnerCaseInsensitive(owner)
    if (!row) return c.json({ error: 'not_installed' }, 404)
    return c.json(
      {
        orgId: row.orgId,
        installationId: row.installationId,
        installedAt: row.installedAt.toISOString(),
        suspendedAt: row.suspendedAt ? row.suspendedAt.toISOString() : null,
      },
      200,
    )
  })

  return router
}

import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../lib/db/client'
import { userInstallations } from '../../../../lib/db/schema'
import { syncUserInstallations } from '../../../../lib/github/installation-sync'
import { createClient } from '../../../../lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Reconcile the user's installation rows against what GitHub says the user can
 * actually access right now. Detects an already-installed app (e.g. installed
 * on an org before this account onboarded) without forcing a re-install.
 *
 * Needs the GitHub OAuth token from the Supabase session (`provider_token`),
 * present after a GitHub sign-in. Absent for email sign-ins or after a session
 * refresh → falls back to the stored rows (populated at login by the OAuth
 * callback) and signals `reauthRequired` so the UI keeps the install button.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const providerToken = session?.provider_token ?? null

  if (providerToken) {
    try {
      await syncUserInstallations(user.id, providerToken)
    } catch (err) {
      // Best-effort — fall through to whatever is already stored.
      console.warn('[sync-installations] discovery failed', err)
    }
  }

  const rows = await db
    .select()
    .from(userInstallations)
    .where(and(eq(userInstallations.userId, user.id), isNull(userInstallations.suspendedAt)))
    .orderBy(desc(userInstallations.installedAt))

  return Response.json({ installations: rows, reauthRequired: !providerToken && rows.length === 0 })
}

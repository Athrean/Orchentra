import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../lib/db/client'
import { userInstallations } from '../../../../lib/db/schema'
import { createClient } from '../../../../lib/supabase/server'
import { listInstallationRepos } from '../../../../lib/github/installation-repos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const installs = await db
    .select()
    .from(userInstallations)
    .where(and(eq(userInstallations.userId, user.id), isNull(userInstallations.suspendedAt)))

  if (installs.length === 0) {
    return Response.json({ installations: [] })
  }

  const result: Array<{
    installationId: number
    accountLogin: string
    repos: Awaited<ReturnType<typeof listInstallationRepos>>
  }> = []

  for (const inst of installs) {
    try {
      const repos = await listInstallationRepos(inst.installationId)
      result.push({ installationId: inst.installationId, accountLogin: inst.accountLogin, repos })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'list_repos_failed'
      result.push({ installationId: inst.installationId, accountLogin: inst.accountLogin, repos: [] })
      console.error(`[install ${inst.installationId}] ${msg}`)
    }
  }

  return Response.json({ installations: result })
}

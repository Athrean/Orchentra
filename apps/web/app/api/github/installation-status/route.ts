import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../lib/db/client'
import { userInstallations } from '../../../../lib/db/schema'
import { createClient } from '../../../../lib/supabase/server'

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

  const rows = await db
    .select()
    .from(userInstallations)
    .where(and(eq(userInstallations.userId, user.id), isNull(userInstallations.suspendedAt)))
    .orderBy(desc(userInstallations.installedAt))

  return Response.json({ installations: rows })
}

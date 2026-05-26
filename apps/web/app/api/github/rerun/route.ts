import { z } from 'zod'
import { assertRepoAccess } from '../../../../lib/github/run-access'
import { rerunFailedJobs } from '../../../../lib/github/run-actions'
import { createClient } from '../../../../lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  installationId: z.number().int().positive(),
  repoFullName: z.string().min(1),
  runId: z.number().int().positive(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'invalid body' }), { status: 400 })
  }
  const { installationId, repoFullName, runId } = parsed.data

  const allowed = await assertRepoAccess(user.id, installationId, repoFullName)
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
  }

  try {
    await rerunFailedJobs(installationId, repoFullName, runId)
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'rerun failed'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}

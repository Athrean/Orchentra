import { z } from 'zod'
import { db } from '../../../../lib/db/client'
import { repoSubscriptions } from '../../../../lib/db/schema'
import { setOnboardingStep } from '../../../../lib/db/queries/onboarding'
import { createClient } from '../../../../lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  repos: z
    .array(
      z.object({
        installationId: z.number().int().positive(),
        repoFullName: z.string().min(1),
        repoId: z.number().int().positive().optional(),
      }),
    )
    .min(1),
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

  try {
    const rows = parsed.data.repos.map((r) => ({
      userId: user.id,
      installationId: r.installationId,
      repoFullName: r.repoFullName,
      repoId: r.repoId,
      enabled: true,
    }))

    await db
      .insert(repoSubscriptions)
      .values(rows)
      .onConflictDoUpdate({
        target: [repoSubscriptions.userId, repoSubscriptions.repoFullName],
        set: { enabled: true, updatedAt: new Date() },
      })

    const state = await setOnboardingStep(user.id, 'completed')
    return Response.json({ ok: true, state })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'subscribe failed'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}

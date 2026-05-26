import { z } from 'zod'
import { createClient } from '../../../../lib/supabase/server'
import { setOnboardingStep } from '../../../../lib/db/queries/onboarding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  step: z.enum(['welcome', 'install_app', 'select_repos', 'completed']),
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
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'invalid step' }), { status: 400 })
  }

  try {
    const next = await setOnboardingStep(user.id, parsed.data.step)
    return Response.json({ ok: true, state: next })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'advance failed'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}

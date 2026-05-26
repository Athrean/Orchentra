import { createClient } from '../../../../lib/supabase/server'
import { installUrl } from '../../../../lib/github/app-credentials'
import { signInstallState } from '../../../../lib/github/install-state'

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

  try {
    const state = signInstallState(user.id)
    return Response.json({ url: installUrl(state) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to build install url'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}

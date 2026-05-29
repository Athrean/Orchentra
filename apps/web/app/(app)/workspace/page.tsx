import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { CoworkSurface } from '../../../components/pd/workspace/CoworkSurface'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Workspace · Orchentra' }

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { q } = await searchParams

  return <CoworkSurface initialPrompt={q ?? null} />
}

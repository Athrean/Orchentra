import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { CoworkSurface } from '../../../components/pd/workspace/CoworkSurface'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Triage · Orchentra' }

export default async function TriagePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { q } = await searchParams

  return <CoworkSurface mode="triage" initialPrompt={q ?? null} />
}

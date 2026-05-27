import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { ChatThread } from '../../../components/pd/workspace/ChatThread'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Workspace · Orchentra' }

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const avatarUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null
  const { q } = await searchParams

  return <ChatThread initialMessages={[]} initialPrompt={q ?? null} userAvatarUrl={avatarUrl} />
}

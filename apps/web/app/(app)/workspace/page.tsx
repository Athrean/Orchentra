import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { ChatThread } from '../../../components/pd/workspace/ChatThread'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Workspace · Orchentra' }

export default async function WorkspacePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const avatarUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null

  return <ChatThread initialMessages={[]} userAvatarUrl={avatarUrl} />
}

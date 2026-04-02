'use client'

import { useMe } from '../../lib/hooks'
import { DashboardLayout } from './DashboardLayout'
import { ChatPanel } from './ChatPanel'

export function ChatDashboard({ repo }: { repo: string }): React.ReactElement {
  const { data: me } = useMe()
  if (!me?.user) return <div />
  return (
    <DashboardLayout repo={repo}>
      <div className="flex h-full">
        <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--color-app-text-muted)' }}>
          <p className="text-sm">Select an incident from the sidebar or ask the chat assistant.</p>
        </div>
        <aside className="w-[320px] border-l flex flex-col" style={{ borderColor: 'var(--color-app-border)' }}>
          <ChatPanel repo={repo} />
        </aside>
      </div>
    </DashboardLayout>
  )
}

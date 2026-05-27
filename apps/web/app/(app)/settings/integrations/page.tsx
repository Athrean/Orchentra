import { and, desc, eq, isNull } from 'drizzle-orm'
import { Github, PlugZap } from 'lucide-react'
import { redirect } from 'next/navigation'
import { db } from '../../../../lib/db/client'
import { userInstallations } from '../../../../lib/db/schema'
import { createClient } from '../../../../lib/supabase/server'
import { SettingsSection } from '../../../../components/pd/settings/SettingsSection'

export const metadata = { title: 'Integrations · Orchentra' }

const placeholders = [
  { name: 'Slack', description: 'Route alert notifications into team channels.' },
  { name: 'Linear', description: 'Create and link follow-up engineering work.' },
  { name: 'Jira', description: 'Sync incident tasks with project workflows.' },
]

export default async function SettingsIntegrationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const installations = await db
    .select()
    .from(userInstallations)
    .where(and(eq(userInstallations.userId, user.id), isNull(userInstallations.suspendedAt)))
    .orderBy(desc(userInstallations.updatedAt))

  return (
    <SettingsSection title="Integrations" description="Review connected tools and available integration placeholders.">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="surface p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-pg-surface-1">
              <Github className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-pg-text-0">GitHub</div>
              <div className="mt-1 text-sm text-pg-text-mute">
                {installations.length > 0
                  ? `${installations.length} installation${installations.length === 1 ? '' : 's'} connected`
                  : 'Not connected'}
              </div>
              {installations.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1 text-xs text-pg-text-mute">
                  {installations.map((installation) => (
                    <li key={installation.id}>{installation.accountLogin}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
        {placeholders.map((item) => (
          <div key={item.name} className="surface p-4 opacity-80">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-pg-surface-1">
                <PlugZap className="h-4 w-4" />
              </span>
              <div>
                <div className="font-medium text-pg-text-0">{item.name}</div>
                <div className="mt-1 text-sm text-pg-text-mute">{item.description}</div>
                <div className="mt-3 text-xs text-pg-text-mute">Placeholder</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SettingsSection>
  )
}

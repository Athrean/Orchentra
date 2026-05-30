import { and, desc, eq, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '../../../../lib/db/client'
import { userInstallations } from '../../../../lib/db/schema'
import { createClient } from '../../../../lib/supabase/server'
import { SettingsSection } from '../../../../components/pd/settings/SettingsSection'

export const metadata = { title: 'Integrations · Orchentra' }

type IntegrationId = 'github' | 'slack' | 'linear' | 'jira'

const placeholders: { id: IntegrationId; name: string; description: string }[] = [
  { id: 'slack', name: 'Slack', description: 'Route alert notifications into team channels.' },
  { id: 'linear', name: 'Linear', description: 'Create and link follow-up engineering work.' },
  { id: 'jira', name: 'Jira', description: 'Sync incident tasks with project workflows.' },
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
              <IntegrationIcon id="github" />
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
                <IntegrationIcon id={item.id} />
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

function IntegrationIcon({ id }: { id: IntegrationId }) {
  if (id === 'github') return <GitHubIcon />
  if (id === 'slack') return <SlackIcon />
  if (id === 'linear') return <LinearIcon />
  return <JiraIcon />
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#171716" aria-hidden="true">
      <path d="M12 .297C5.373.297 0 5.67 0 12.297c0 5.303 3.438 9.8 8.207 11.387.6.111.82-.26.82-.577 0-.285-.011-1.23-.016-2.23-3.338.726-4.043-1.416-4.043-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.238 1.84 1.238 1.07 1.834 2.807 1.304 3.492.997.108-.775.419-1.305.762-1.605-2.665-.303-5.467-1.332-5.467-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.52 11.52 0 0 1 12 6.103c1.02.005 2.047.138 3.006.405 2.291-1.552 3.297-1.23 3.297-1.23.655 1.652.243 2.873.119 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.807 5.624-5.479 5.921.43.372.814 1.103.814 2.222 0 1.605-.015 2.898-.015 3.291 0 .32.216.694.825.576C20.565 22.092 24 17.598 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function SlackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#E01E5A"
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522z"
      />
      <path
        fill="#36C5F0"
        d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521z"
      />
      <path
        fill="#2EB67D"
        d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522zm-1.269 0a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.522 2.522z"
      />
      <path
        fill="#ECB22E"
        d="M15.165 18.956a2.528 2.528 0 0 1 2.522 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522zm0-1.269a2.527 2.527 0 0 1-2.52-2.522 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.522z"
      />
    </svg>
  )
}

function LinearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#5E6AD2" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 .684.057 1.354.167 2.006L14.006.167A12.12 12.12 0 0 0 12 0m4.813.988L.988 16.813a12.01 12.01 0 0 0 1.464 2.118L18.931 2.452A12.01 12.01 0 0 0 16.813.988M21.155 4.8 4.8 21.155a12.02 12.02 0 0 0 2.592 1.47L22.625 7.392a12.02 12.02 0 0 0-1.47-2.592m2.678 5.194L9.994 23.833A12.116 12.116 0 0 0 12 24c6.627 0 12-5.373 12-12 0-.684-.057-1.354-.167-2.006" />
    </svg>
  )
}

function JiraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <defs>
        <linearGradient id="jira-left" x1="8.5" x2="2.5" y1="11.5" y2="17.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2684FF" />
          <stop offset="1" stopColor="#0052CC" />
        </linearGradient>
        <linearGradient id="jira-right" x1="15.5" x2="21.5" y1="12.5" y2="6.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2684FF" />
          <stop offset="1" stopColor="#0052CC" />
        </linearGradient>
      </defs>
      <path
        fill="url(#jira-left)"
        d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005"
      />
      <path
        fill="#2684FF"
        d="M17.294 5.757H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001"
      />
      <path
        fill="url(#jira-right)"
        d="M23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0"
      />
    </svg>
  )
}

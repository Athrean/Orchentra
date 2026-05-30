import { desc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Laptop } from 'lucide-react'
import { createClient } from '../../../../lib/supabase/server'
import { db } from '../../../../lib/db/client'
import { cliInstalls } from '../../../../lib/db/schema'
import { SettingsSection } from '../../../../components/pd/settings/SettingsSection'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/pd/ui/card'

export const metadata = { title: 'CLI devices · Orchentra' }

export default async function SettingsDevicesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const installs = await db
    .select()
    .from(cliInstalls)
    .where(eq(cliInstalls.userId, user.id))
    .orderBy(desc(cliInstalls.lastSeenAt))

  return (
    <SettingsSection title="CLI devices" description="Machines that ran orchentra login with this account.">
      <Card>
        <CardHeader>
          <CardTitle>Installs</CardTitle>
          <CardDescription>Revoking a device invalidates its session on next refresh.</CardDescription>
        </CardHeader>
        <CardContent>
          {installs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-pg-text-mute">
              <Laptop className="h-5 w-5 text-pg-text-mute/70" />
              No CLI installs yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {installs.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-[10px] bg-pg-surface-0 px-3 py-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Laptop className="h-4 w-4 text-pg-text-mute" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-pg-text-0">{row.hostname ?? row.machineId}</span>
                      <span className="text-xs text-pg-text-mute">
                        {[row.os, row.cliVersion].filter(Boolean).join(' / ') || 'unknown'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-pg-text-mute">
                    {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : '-'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </SettingsSection>
  )
}

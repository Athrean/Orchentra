import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Laptop } from 'lucide-react'
import { createClient } from '../../../../lib/supabase/server'
import { db } from '../../../../lib/db/client'
import { cliInstalls } from '../../../../lib/db/schema'
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-8 pb-12">
      <header className="pt-8">
        <h1 className="text-2xl font-semibold tracking-tight text-pg-text-0">Settings</h1>
        <p className="mt-1 text-sm text-pg-text-mute">Machines that ran `orchentra login` with this account.</p>
      </header>

      <nav className="flex gap-2 text-sm">
        <Link
          href="/settings"
          className="rounded-[8px] px-3 py-1.5 text-pg-text-mute hover:bg-pg-surface-1 hover:text-pg-text-0"
        >
          Profile settings
        </Link>
        <span className="rounded-[8px] bg-pg-text-0 px-3 py-1.5 text-white">CLI devices</span>
      </nav>

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
    </div>
  )
}

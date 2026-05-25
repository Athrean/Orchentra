import { desc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Laptop } from 'lucide-react'
import { createClient } from '../../../../lib/supabase/server'
import { db } from '../../../../lib/db/client'
import { cliInstalls } from '../../../../lib/db/schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/pd/ui/card'

export const metadata = { title: 'CLI devices · Orchentra' }

export default async function DevicesPage() {
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--color-pd-text)]">CLI devices</h2>
        <p className="text-sm text-[var(--color-pd-text-muted)]">
          Machines that ran `orchentra login` with this account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Installs</CardTitle>
          <CardDescription>Revoking a device invalidates its session on next refresh.</CardDescription>
        </CardHeader>
        <CardContent>
          {installs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-[var(--color-pd-text-muted)]">
              <Laptop className="h-5 w-5 text-[var(--color-pd-text-subtle)]" />
              No CLI installs yet.
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--color-pd-border)]">
              {installs.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <Laptop className="h-4 w-4 text-[var(--color-pd-text-subtle)]" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[var(--color-pd-text)]">{row.hostname ?? row.machineId}</span>
                      <span className="text-xs text-[var(--color-pd-text-muted)]">
                        {[row.os, row.cliVersion].filter(Boolean).join(' · ') || 'unknown'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-[var(--color-pd-text-subtle)]">
                    {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : '—'}
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

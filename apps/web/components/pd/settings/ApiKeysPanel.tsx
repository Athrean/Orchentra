'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Plus, Ban } from 'lucide-react'
import { createProjectApiKey, revokeProjectApiKey } from '../../../app/(app)/settings/api-keys/actions'
import type { ProjectApiKey } from '../../../lib/db/schema'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

export function ApiKeysPanel({ keys }: { keys: ProjectApiKey[] }) {
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [plaintext, setPlaintext] = React.useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const result = await createProjectApiKey({ name })
      setPlaintext(result.token)
      setName('')
      toast.success('API key created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={create} className="surface flex flex-col gap-3 p-4 md:flex-row md:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="keyName">Key name</Label>
          <Input
            id="keyName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Production deploy bot"
          />
        </div>
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          <Plus className="h-3.5 w-3.5" />
          Create key
        </Button>
      </form>

      {plaintext ? (
        <div className="rounded-[8px] bg-emerald-500/10 p-4 text-sm text-emerald-800">
          <div className="font-medium">Copy this token now. It will not be shown again.</div>
          <code className="mt-2 block overflow-x-auto rounded-[6px] bg-pg-surface-card px-3 py-2 text-pg-text-0">
            {plaintext}
          </code>
        </div>
      ) : null}

      <div className="surface overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Name', 'Token', 'Created', 'Last used', 'Status', ''].map((column) => (
                <th
                  key={column}
                  className="border-b border-pg-hairline bg-pg-surface-1/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-pg-text-mute"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-14 text-center text-sm text-pg-text-mute">
                  No API keys created.
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id} className="border-b border-pg-hairline text-sm last:border-b-0">
                  <td className="px-4 py-3 text-pg-text-0">{key.name}</td>
                  <td className="px-4 py-3 font-mono text-pg-text-mute">{key.tokenPrefix}...</td>
                  <td className="px-4 py-3 text-pg-text-mute">{key.createdAt.toLocaleString()}</td>
                  <td className="px-4 py-3 text-pg-text-mute">{key.lastUsedAt?.toLocaleString() ?? '-'}</td>
                  <td className="px-4 py-3 text-pg-text-mute">{key.revokedAt ? 'Revoked' : 'Active'}</td>
                  <td className="px-4 py-3 text-right">
                    {!key.revokedAt ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void revokeProjectApiKey(key.id)}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

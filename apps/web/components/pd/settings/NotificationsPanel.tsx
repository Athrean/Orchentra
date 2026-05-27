'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { saveNotificationPrefs } from '../../../app/(app)/settings/notifications/actions'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

const categories = [
  'Critical alerts',
  'Non-critical alerts',
  'Comments & Mentions',
  'Approval requests',
  'Prompt changes',
  'Experimental updates',
  'Daily digest',
  'Eval assignments',
  'Eval updates',
] as const

interface ChannelPref {
  inApp: boolean
  slack: boolean
  email: boolean
}
type PrefMap = Record<string, ChannelPref>

export function NotificationsPanel({
  initialPrefs,
  initialSlackDm,
  initialQuietStart,
  initialQuietEnd,
}: {
  initialPrefs: PrefMap
  initialSlackDm: boolean
  initialQuietStart: string
  initialQuietEnd: string
}) {
  const [prefs, setPrefs] = React.useState<PrefMap>(() => defaultPrefs(initialPrefs))
  const [slackDm, setSlackDm] = React.useState(initialSlackDm)
  const [quietStart, setQuietStart] = React.useState(initialQuietStart)
  const [quietEnd, setQuietEnd] = React.useState(initialQuietEnd)
  const [busy, setBusy] = React.useState(false)

  async function save() {
    setBusy(true)
    try {
      await saveNotificationPrefs({ prefs, slackDm, quietHoursStart: quietStart, quietHoursEnd: quietEnd })
      toast.success('Notification preferences saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="surface overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Category', 'In-App', 'Slack', 'Email'].map((column) => (
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
            {categories.map((category) => (
              <tr key={category} className="border-b border-pg-hairline text-sm last:border-b-0">
                <td className="px-4 py-3 text-pg-text-0">{category}</td>
                {(['inApp', 'slack', 'email'] as const).map((channel) => (
                  <td key={channel} className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={prefs[category]?.[channel] ?? false}
                      onChange={(e) =>
                        setPrefs((current) => ({
                          ...current,
                          [category]: { ...current[category], [channel]: e.target.checked },
                        }))
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="surface grid gap-4 p-4 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-pg-text-0">
          <input type="checkbox" checked={slackDm} onChange={(e) => setSlackDm(e.target.checked)} />
          Slack DM
        </label>
        <Input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
        <Input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={() => void save()} loading={busy}>
          Save
        </Button>
      </div>
    </div>
  )
}

function defaultPrefs(initial: PrefMap): PrefMap {
  return Object.fromEntries(
    categories.map((category) => [
      category,
      initial[category] ?? {
        inApp: true,
        slack: false,
        email: false,
      },
    ]),
  )
}

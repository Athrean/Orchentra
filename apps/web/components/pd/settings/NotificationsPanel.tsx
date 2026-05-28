'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Info } from 'lucide-react'
import { saveNotificationPrefs } from '../../../app/(app)/settings/notifications/actions'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface CategoryDef {
  key: string
  label: string
  hint?: string
  inApp: 'always-on' | 'na'
}

const categories: CategoryDef[] = [
  { key: 'Critical alerts', label: 'Critical alerts', hint: 'Severity-1 incidents and pages.', inApp: 'always-on' },
  { key: 'Non-critical alerts', label: 'Non-critical alerts', inApp: 'always-on' },
  { key: 'Comments & Mentions', label: 'Comments & Mentions', inApp: 'always-on' },
  { key: 'Approval requests', label: 'Approval requests', inApp: 'always-on' },
  { key: 'Prompt changes', label: 'Prompt changes', inApp: 'always-on' },
  { key: 'Experimental updates', label: 'Experimental updates', inApp: 'always-on' },
  { key: 'Daily digest', label: 'Daily digest', inApp: 'na' },
  {
    key: 'Eval assignments',
    label: 'Eval assignments',
    hint: 'When you are assigned to review an eval.',
    inApp: 'always-on',
  },
  { key: 'Eval updates', label: 'Eval updates', hint: 'Status changes on evals you own.', inApp: 'always-on' },
]

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
  const [dirty, setDirty] = React.useState(false)

  async function save() {
    setBusy(true)
    try {
      await saveNotificationPrefs({ prefs, slackDm, quietHoursStart: quietStart, quietHoursEnd: quietEnd })
      setDirty(false)
      toast.success('Notification preferences saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setPrefs(defaultPrefs(initialPrefs))
    setSlackDm(initialSlackDm)
    setQuietStart(initialQuietStart)
    setQuietEnd(initialQuietEnd)
    setDirty(false)
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
                  className={
                    column === 'Category'
                      ? 'border-b border-pg-hairline bg-pg-surface-1/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-pg-text-mute'
                      : 'border-b border-pg-hairline bg-pg-surface-1/50 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-pg-text-mute'
                  }
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.key} className="border-b border-pg-hairline text-sm last:border-b-0">
                <td className="px-4 py-3 text-pg-text-0">
                  <div className="flex items-center gap-1.5">
                    <span>{category.label}</span>
                    {category.hint ? (
                      <span title={category.hint}>
                        <Info className="h-3.5 w-3.5 text-pg-text-mute" />
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-xs text-pg-text-mute">
                  {category.inApp === 'always-on' ? 'Always on' : '—'}
                </td>
                {(['slack', 'email'] as const).map((channel) => (
                  <td key={channel} className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-pg-accent-green"
                      checked={prefs[category.key]?.[channel] ?? false}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setPrefs((current) => ({
                          ...current,
                          [category.key]: { ...current[category.key], [channel]: checked },
                        }))
                        setDirty(true)
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="surface flex items-center justify-between gap-4 p-4">
        <div>
          <div className="text-sm font-medium text-pg-text-0">Slack DM Notifications</div>
          <div className="text-xs text-pg-text-mute">
            Receive Slack notifications as direct messages instead of channel posts.
          </div>
        </div>
        <Toggle
          checked={slackDm}
          onChange={(next) => {
            setSlackDm(next)
            setDirty(true)
          }}
        />
      </div>

      <div className="surface flex items-center justify-between gap-4 p-4">
        <div>
          <div className="text-sm font-medium text-pg-text-0">Quiet hours</div>
          <div className="text-xs text-pg-text-mute">Defer Slack and email during this window; in-app stays on.</div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="time"
            value={quietStart}
            onChange={(e) => {
              setQuietStart(e.target.value)
              setDirty(true)
            }}
            className="w-28"
          />
          <span className="text-xs text-pg-text-mute">to</span>
          <Input
            type="time"
            value={quietEnd}
            onChange={(e) => {
              setQuietEnd(e.target.value)
              setDirty(true)
            }}
            className="w-28"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={reset} disabled={!dirty}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} loading={busy} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={
        checked
          ? 'inline-flex h-6 w-10 items-center rounded-full bg-pg-accent-green p-1 transition-colors'
          : 'inline-flex h-6 w-10 items-center rounded-full bg-pg-surface-1 p-1 transition-colors'
      }
    >
      <span
        className={
          checked
            ? 'h-4 w-4 translate-x-4 rounded-full bg-white shadow transition-transform'
            : 'h-4 w-4 translate-x-0 rounded-full bg-white shadow transition-transform'
        }
      />
    </button>
  )
}

function defaultPrefs(initial: PrefMap): PrefMap {
  return Object.fromEntries(
    categories.map((category) => [
      category.key,
      initial[category.key] ?? {
        inApp: true,
        slack: false,
        email: false,
      },
    ]),
  )
}

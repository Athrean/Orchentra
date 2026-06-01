'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Bell, Plus, Trash2 } from 'lucide-react'
import { deleteAlertRule, saveAlertRule } from '../../../app/(app)/settings/alerts/actions'
import type { AlertHistory, AlertRule } from '../../../lib/db/schema'
import { Modal } from '../overlay/Modal'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

type AlertComparator = '>' | '>=' | '<' | '<=' | '='
type RuleForm = Pick<AlertRule, 'name' | 'signal' | 'threshold' | 'enabled'> & {
  id?: string
  comparator: AlertComparator
}

export function AlertsPanel({ rules, history }: { rules: AlertRule[]; history: AlertHistory[] }) {
  const [tab, setTab] = React.useState<'rules' | 'history'>('rules')
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<RuleForm>(emptyRule())

  async function save(e: React.FormEvent) {
    e.preventDefault()
    try {
      await saveAlertRule(form)
      toast.success('Alert rule saved')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex rounded-[8px] bg-pg-surface-card p-1 shadow-[0_0_0_1px_rgba(20,20,18,0.06)]">
          {(['rules', 'history'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={
                tab === item
                  ? 'rounded-[7px] bg-pg-inverse px-3 py-1.5 text-xs font-medium text-pg-inverse-text'
                  : 'rounded-[7px] px-3 py-1.5 text-xs text-pg-text-mute'
              }
            >
              {item === 'rules' ? 'Rules' : 'History'}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setForm(emptyRule())
            setOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Alert
        </Button>
      </div>

      {tab === 'rules' ? (
        <div className="surface overflow-hidden">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-pg-surface-1">
                <Bell className="h-4 w-4 text-pg-text-mute" />
              </span>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-pg-text-0">No alerts created</div>
                <div className="text-xs text-pg-text-mute">
                  Start creating alerts to get notified when something goes wrong with detections.
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setForm(emptyRule())
                  setOpen(true)
                }}
              >
                Create alert
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-pg-hairline">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-pg-surface-1/60"
                >
                  <div>
                    <div className="font-medium text-pg-text-0">{rule.name}</div>
                    <div className="text-xs text-pg-text-mute">
                      {rule.signal} {rule.comparator} {rule.threshold} · {rule.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setForm({ ...rule, comparator: toComparator(rule.comparator) })
                        setOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => void deleteAlertRule(rule.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="surface overflow-hidden">
          {history.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-pg-surface-1">
                <Bell className="h-4 w-4 text-pg-text-mute" />
              </span>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-pg-text-0">No alert history yet</div>
                <div className="text-xs text-pg-text-mute">
                  Create an alert rule first. Fired alert events will appear here.
                </div>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-pg-hairline">
              {history.map((item) => (
                <li key={item.id} className="px-4 py-3 text-sm transition-colors hover:bg-pg-surface-1/60">
                  <div className="text-pg-text-0">{item.message}</div>
                  <div className="text-xs text-pg-text-mute">{item.firedAt.toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal open={open} onOpenChange={setOpen} title="Alert rule" maxWidth="md">
        <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="Name" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
          <Field
            label="Signal"
            value={form.signal}
            onChange={(signal) => setForm((current) => ({ ...current, signal }))}
          />
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>When</Label>
              <select
                className="h-9 rounded-[8px] bg-pg-surface-0 px-3 text-sm"
                value={form.comparator}
                onChange={(e) =>
                  setForm((current) => ({ ...current, comparator: e.target.value as RuleForm['comparator'] }))
                }
              >
                {['>', '>=', '<', '<=', '='].map((op) => (
                  <option key={op}>{op}</option>
                ))}
              </select>
            </div>
            <Field
              label="Threshold"
              value={form.threshold}
              onChange={(threshold) => setForm((current) => ({ ...current, threshold }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-pg-text-0">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-pg-accent-green"
              checked={form.enabled}
              onChange={(e) => setForm((current) => ({ ...current, enabled: e.target.checked }))}
            />
            Enabled
          </label>
          <div className="flex justify-end">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function toComparator(value: string): AlertComparator {
  return value === '>' || value === '>=' || value === '<' || value === '<=' || value === '=' ? value : '>'
}

function emptyRule(): RuleForm {
  return { name: '', signal: 'estimated_cost_usd', comparator: '>', threshold: '10', enabled: true }
}

'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CheckCircle2, KeyRound, Pencil, Trash2 } from 'lucide-react'
import {
  deleteProviderCredentialAction,
  saveProviderCredentialAction,
  testProviderCredentialAction,
} from '../../../app/(app)/settings/ai-providers/actions'
import { providerCatalog, type ProviderId } from '../../../lib/ai-providers/catalog'
import type { MaskedProviderCredential } from '../../../lib/ai-providers/credential-store'
import { Modal } from '../overlay/Modal'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface AiProvidersTableProps {
  credentials: MaskedProviderCredential[]
}

interface FormState {
  provider: ProviderId
  apiKey: string
  baseUrl: string
  defaultModel: string
}

export function AiProvidersTable({ credentials }: AiProvidersTableProps) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<'idle' | 'save' | 'delete' | 'test'>('idle')
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [form, setForm] = React.useState<FormState>(() => initialForm('openai', credentials))
  const credentialByProvider = new Map(credentials.map((credential) => [credential.provider, credential]))
  const selectedCatalog = providerCatalog.find((provider) => provider.id === form.provider) ?? providerCatalog[0]
  const selectedCredential = credentialByProvider.get(form.provider)

  function configure(provider: ProviderId) {
    setForm(initialForm(provider, credentials))
    setTestResult(null)
    setOpen(true)
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy('save')
    try {
      await saveProviderCredentialAction(form)
      toast.success(`${selectedCatalog.name} saved`)
      setForm((current) => ({ ...current, apiKey: '' }))
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy('idle')
    }
  }

  async function onDelete() {
    setBusy('delete')
    try {
      await deleteProviderCredentialAction(form.provider)
      toast.success(`${selectedCatalog.name} removed`)
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy('idle')
    }
  }

  async function onTest() {
    setBusy('test')
    setTestResult(null)
    try {
      const result = await testProviderCredentialAction(form)
      setTestResult({
        ok: result.ok,
        message: result.ok ? 'Key validated successfully.' : result.error || 'Key validation failed.',
      })
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Key validation failed.' })
    } finally {
      setBusy('idle')
    }
  }

  return (
    <>
      <div className="surface overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Provider', 'Status', 'Default model', 'Base URL', 'Last updated', ''].map((column) => (
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
            {providerCatalog.map((provider) => {
              const credential = credentialByProvider.get(provider.id)
              return (
                <tr key={provider.id} className="border-b border-pg-hairline text-sm last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-pg-text-0">{provider.name}</div>
                    <div className="mt-0.5 text-xs text-pg-text-mute">{provider.description}</div>
                  </td>
                  <td className="px-4 py-3">
                    {credential?.configured ? (
                      <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Configured
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-pg-surface-1 px-2 py-1 text-xs text-pg-text-mute">
                        <KeyRound className="h-3.5 w-3.5" />
                        Not set
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-pg-text-mute">{credential?.defaultModel ?? provider.models[0]}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-pg-text-mute">
                    {credential?.baseUrl ?? provider.defaultBaseUrl ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-pg-text-mute">
                    {credential?.updatedAt ? credential.updatedAt.toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button type="button" variant="outline" size="sm" onClick={() => configure(provider.id)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Configure
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Configure ${selectedCatalog.name}`}
        description="Keys are encrypted before storage and never shown after save."
        maxWidth="lg"
      >
        <form onSubmit={onSave} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="provider">Provider</Label>
              <select
                id="provider"
                value={form.provider}
                onChange={(e) => {
                  setForm(initialForm(e.target.value as ProviderId, credentials))
                  setTestResult(null)
                }}
                className="h-9 rounded-[8px] bg-pg-surface-0 px-3 text-sm text-pg-text-0 shadow-[0_0_0_1px_rgba(20,20,18,0.08)] outline-none"
              >
                {providerCatalog.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="defaultModel">Default model</Label>
              <select
                id="defaultModel"
                value={form.defaultModel}
                onChange={(e) => setForm((current) => ({ ...current, defaultModel: e.target.value }))}
                className="h-9 rounded-[8px] bg-pg-surface-0 px-3 text-sm text-pg-text-0 shadow-[0_0_0_1px_rgba(20,20,18,0.08)] outline-none"
              >
                {selectedCatalog.models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apiKey">{selectedCredential?.configured ? 'Replace API key' : 'API key'}</Label>
            <Input
              id="apiKey"
              type="password"
              autoComplete="off"
              value={form.apiKey}
              placeholder={selectedCatalog.keyPlaceholder}
              onChange={(e) => {
                setForm((current) => ({ ...current, apiKey: e.target.value }))
                setTestResult(null)
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              type="url"
              value={form.baseUrl}
              placeholder={selectedCatalog.baseUrlPlaceholder}
              onChange={(e) => {
                setForm((current) => ({ ...current, baseUrl: e.target.value }))
                setTestResult(null)
              }}
            />
          </div>

          {testResult ? (
            <div
              className={
                testResult.ok
                  ? 'rounded-[8px] bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700'
                  : 'rounded-[8px] bg-red-500/10 px-3 py-2 text-sm text-red-600'
              }
            >
              {testResult.message}
            </div>
          ) : null}

          <div className="flex items-center justify-between pt-2">
            {selectedCredential?.configured ? (
              <Button type="button" variant="destructive" onClick={onDelete} loading={busy === 'delete'}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                loading={busy === 'test'}
                disabled={!form.apiKey.trim()}
                onClick={onTest}
              >
                Test key
              </Button>
              <Button type="submit" loading={busy === 'save'} disabled={!form.apiKey.trim()}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  )
}

function initialForm(provider: ProviderId, credentials: MaskedProviderCredential[]): FormState {
  const catalogItem = providerCatalog.find((item) => item.id === provider) ?? providerCatalog[0]
  const credential = credentials.find((item) => item.provider === provider)
  return {
    provider,
    apiKey: '',
    baseUrl: credential?.baseUrl ?? catalogItem.defaultBaseUrl ?? '',
    defaultModel: credential?.defaultModel ?? catalogItem.models[0],
  }
}

'use client'

import * as React from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { ExternalLink, Trash2 } from 'lucide-react'
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
    if (!form.apiKey.trim()) {
      setTestResult({ ok: false, message: 'Enter an API key to test.' })
      return
    }
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
              {['Name', 'Status', 'Last updated'].map((column) => (
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
                <tr
                  key={provider.id}
                  className="cursor-pointer border-b border-pg-hairline text-sm transition-colors last:border-b-0 hover:bg-pg-surface-1/40"
                  onClick={() => configure(provider.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <ProviderIcon provider={provider.id} />
                      <span className="font-medium text-pg-text-0">{provider.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-pg-text-mute">
                    {credential?.configured ? 'Configured' : 'Not configured'}
                  </td>
                  <td className="px-4 py-3 text-pg-text-mute">
                    {credential?.updatedAt ? credential.updatedAt.toLocaleString() : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={open} onOpenChange={setOpen} title="Configure API key" maxWidth="md">
        <form onSubmit={onSave} className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <ProviderIcon provider={selectedCatalog.id} size={36} />
            <div className="flex flex-col">
              <div className="font-medium text-pg-text-0">{selectedCatalog.name}</div>
              <a
                href={selectedCatalog.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-pg-text-mute hover:text-pg-text-0"
              >
                Provider docs <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apiKey">API key</Label>
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
            <p className="text-xs text-pg-text-mute">
              {selectedCredential?.configured
                ? 'A key is already configured. Enter a new value to replace it.'
                : `Create one at ${stripScheme(selectedCatalog.docsUrl)}`}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="baseUrl">Base URL (optional)</Label>
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
            <p className="text-xs text-pg-text-mute">
              Override only if using an OpenAI-compatible proxy or self-hosted endpoint.
            </p>
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
            <p className="text-xs text-pg-text-mute">
              This is the model pre-selected in the playground for this provider.
            </p>
          </div>

          <p className="text-xs text-pg-text-mute">
            Secrets are encrypted at rest with AES-256-GCM (unique IV per record) before being written to the database.
          </p>

          {testResult ? (
            <div
              className={
                testResult.ok
                  ? 'rounded-[8px] bg-pg-accent-green/10 px-3 py-2 text-sm text-pg-accent-green'
                  : 'rounded-[8px] bg-red-500/10 px-3 py-2 text-sm text-red-600'
              }
            >
              {testResult.message}
            </div>
          ) : null}

          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" loading={busy === 'test'} onClick={onTest}>
                Test key
              </Button>
              {selectedCredential?.configured ? (
                <Button type="button" variant="destructive" size="sm" onClick={onDelete} loading={busy === 'delete'}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={busy === 'save'} disabled={!form.apiKey.trim()}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  )
}

function ProviderIcon({ provider, size = 16 }: { provider: ProviderId; size?: number }) {
  const color: Record<ProviderId, string> = {
    openai: '#10A37F',
    anthropic: '#D97757',
    google: '#4285F4',
    openrouter: '#6E56CF',
    xai: '#000000',
    groq: '#F55036',
    'azure-openai': '#0078D4',
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: color[provider] }}
    >
      <Image src="/stripped.png" alt="" width={size * 0.6} height={size * 0.6} className="opacity-0" />
    </span>
  )
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '')
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

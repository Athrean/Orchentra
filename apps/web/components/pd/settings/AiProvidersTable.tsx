'use client'

import * as React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { toast } from 'sonner'
import { Check, ChevronDown, ExternalLink, Trash2 } from 'lucide-react'
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
            <ModelSelect
              id="defaultModel"
              value={form.defaultModel}
              models={selectedCatalog.models}
              onChange={(defaultModel) => setForm((current) => ({ ...current, defaultModel }))}
            />
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

function ModelSelect({
  id,
  value,
  models,
  onChange,
}: {
  id: string
  value: string
  models: string[]
  onChange: (value: string) => void
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          id={id}
          type="button"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-[8px] bg-pg-surface-0 px-3 py-1 text-left text-sm tracking-wide text-pg-text-0 shadow-[0_0_0_1px_rgba(20,20,18,0.08)] outline-none transition-shadow hover:bg-pg-surface-1 focus-visible:shadow-[0_0_0_1px_rgba(28,126,84,0.35)]"
        >
          <span className="truncate">{value}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-pg-text-mute" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-60 max-h-[260px] min-w-(--radix-dropdown-menu-trigger-width) overflow-y-auto rounded-[12px] bg-pg-surface-card p-2 text-pg-text-0 shadow-[0_18px_45px_-24px_rgba(15,15,14,0.45),0_0_0_1px_rgba(20,20,18,0.08)]"
        >
          {models.map((model) => (
            <DropdownMenu.Item
              key={model}
              onSelect={() => onChange(model)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-[9px] px-2.5 py-2 text-sm text-pg-text-0 outline-none transition-colors hover:bg-pg-surface-1 focus:bg-pg-surface-1 data-highlighted:bg-pg-surface-1"
            >
              <span className="truncate">{model}</span>
              {model === value ? <Check className="h-3.5 w-3.5 shrink-0 text-pg-accent-green" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function ProviderIcon({ provider, size = 24 }: { provider: ProviderId; size?: number }) {
  const iconSize = Math.round(size * 0.72)

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center text-pg-text-0"
      style={{ width: size, height: size }}
    >
      {provider === 'openai' ? <OpenAiIcon size={iconSize} /> : null}
      {provider === 'anthropic' ? <ClaudeIcon size={iconSize} /> : null}
      {provider === 'google' ? <GeminiIcon size={iconSize} /> : null}
      {provider === 'openrouter' ? <OpenRouterIcon size={iconSize} /> : null}
    </span>
  )
}

function OpenAiIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#171716">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  )
}

function ClaudeIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <g fill="#D97757">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => (
          <rect
            key={degrees}
            x="10.85"
            y="1.8"
            width="2.3"
            height="8.5"
            rx="1.15"
            transform={`rotate(${degrees} 12 12)`}
          />
        ))}
        <circle cx="12" cy="12" r="2.35" />
      </g>
    </svg>
  )
}

function GeminiIcon({ size }: { size: number }) {
  const gradientId = React.useId()

  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <defs>
        <linearGradient id={gradientId} x1="2.5" x2="21.5" y1="21.5" y2="2.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34A853" />
          <stop offset="0.32" stopColor="#4285F4" />
          <stop offset="0.68" stopColor="#A142F4" />
          <stop offset="1" stopColor="#EA4335" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
      />
    </svg>
  )
}

function OpenRouterIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="#171716">
      <path d="M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z" />
    </svg>
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

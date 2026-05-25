'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { KeyRound, Trash2 } from 'lucide-react'
import { clearLlmKey, saveLlmKey } from '../../../app/(app)/account/actions'
import { llmKeySchema } from '../../../lib/validators/profile'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface Props {
  provider: 'anthropic' | 'openai'
  hasKey: boolean
}

export function LlmKeyForm({ provider: initialProvider, hasKey }: Props) {
  const [provider, setProvider] = React.useState<'anthropic' | 'openai'>(initialProvider)
  const [apiKey, setApiKey] = React.useState('')
  const [busy, setBusy] = React.useState<'idle' | 'save' | 'clear'>('idle')

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    const parsed = llmKeySchema.safeParse({ llmProvider: provider, apiKey })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }
    setBusy('save')
    try {
      await saveLlmKey(parsed.data)
      setApiKey('')
      toast.success('LLM key encrypted and saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy('idle')
    }
  }

  async function onClear() {
    if (!confirm('Remove the stored LLM key? Future LLM calls will fall back to the workspace default.')) return
    setBusy('clear')
    try {
      await clearLlmKey()
      toast.success('LLM key cleared')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setBusy('idle')
    }
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Provider</Label>
        <div className="inline-flex rounded-[4px] border border-neutral-800 p-0.5">
          {(['anthropic', 'openai'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={
                provider === p
                  ? 'rounded-[3px] bg-dark px-3 py-1 text-xs font-medium tracking-wide text-light'
                  : 'rounded-[3px] px-3 py-1 text-xs tracking-wide text-light/70 hover:text-light'
              }
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="apiKey">{hasKey ? 'Replace API key' : 'API key'}</Label>
        <Input
          id="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
        />
        <p className="text-[11px] text-light/40">
          Encrypted with AES-256-GCM before it touches the database. We never log plaintext.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-light/70">
          {hasKey ? (
            <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-neutral-800 px-2 py-1">
              <KeyRound className="h-3 w-3 text-emerald-400" />
              Key on file
            </span>
          ) : (
            'No key set'
          )}
        </div>
        <div className="flex gap-2">
          {hasKey ? (
            <Button type="button" variant="ghost" size="md" onClick={onClear} loading={busy === 'clear'}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          ) : null}
          <Button type="submit" size="md" loading={busy === 'save'} disabled={!apiKey}>
            Save key
          </Button>
        </div>
      </div>
    </form>
  )
}

'use client'

import * as React from 'react'
import Image from 'next/image'
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '../ui/button'

interface InstallAppStepProps {
  onAdvance: () => void
}

interface InstallationRow {
  id: string
  installationId: number
  accountLogin: string
}

const PERMISSIONS = [
  { label: 'Read contents', body: 'Inspect code + workflow files.' },
  { label: 'Read actions', body: 'Surface workflow runs and failures.' },
  { label: 'Read checks', body: 'Show check status per commit.' },
  { label: 'Read metadata', body: 'Resolve repo names + visibility.' },
] as const

export function InstallAppStep({ onAdvance }: InstallAppStepProps) {
  const [opening, setOpening] = React.useState(false)
  const [installed, setInstalled] = React.useState<InstallationRow | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  React.useEffect(() => {
    void syncInstallations()
    pollRef.current = setInterval(() => void checkInstallation(), 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One-shot reconcile against GitHub — catches an app already installed on the
  // user's account/org so they skip straight to repo selection.
  async function syncInstallations() {
    try {
      const res = await fetch('/api/github/sync-installations')
      if (!res.ok) return
      const data = (await res.json()) as { installations: InstallationRow[] }
      const row = data.installations[0]
      if (row) {
        setInstalled(row)
        if (pollRef.current) clearInterval(pollRef.current)
      }
    } catch {
      // silent — the interval poll keeps checking
    }
  }

  async function checkInstallation() {
    try {
      const res = await fetch('/api/github/installation-status')
      if (!res.ok) return
      const data = (await res.json()) as { installations: InstallationRow[] }
      const row = data.installations[0]
      if (row) {
        setInstalled(row)
        if (pollRef.current) clearInterval(pollRef.current)
      }
    } catch {
      // silent — keep polling
    }
  }

  async function openInstall() {
    setOpening(true)
    setError(null)
    try {
      const res = await fetch('/api/github/install-url')
      if (!res.ok) throw new Error(`failed (${res.status})`)
      const data = (await res.json()) as { url: string }
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to open install URL')
    } finally {
      setOpening(false)
    }
  }

  return (
    <section className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image src="/mascot.svg" alt="Orchentra" width={48} height={48} className="opacity-95 [filter:invert(1)]" />
        <h2 className="text-2xl font-semibold tracking-tight text-light">Install Orchentra on GitHub</h2>
        <p className="max-w-md text-sm text-light/70">
          We use a GitHub App to read your workflow runs and CI status. Read-only. You pick which repos.
        </p>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-light/60">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-pg-accent-green-2)]" />
          Permissions requested
        </div>
        <ul className="flex flex-col gap-3">
          {PERMISSIONS.map((p) => (
            <li key={p.label} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--color-pg-accent-green)]/20 text-[var(--color-pg-accent-green-2)]">
                <CheckCircle2 className="h-3 w-3" />
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-light">{p.label}</span>
                <span className="text-xs text-light/60">{p.body}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {installed ? (
        <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-[var(--color-pg-accent-green)]/40 bg-[var(--color-pg-accent-green)]/10 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-[var(--color-pg-accent-green-2)]" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-light">
                Installed on <span className="text-[var(--color-pg-accent-green-2)]">{installed.accountLogin}</span>
              </span>
              <span className="text-xs text-light/65">Choose which repos to track next.</span>
            </div>
          </div>
          <Button
            size="lg"
            onClick={onAdvance}
            className="bg-[var(--color-pg-accent-green)] text-white hover:bg-[var(--color-pg-accent-green-2)]"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            onClick={() => void openInstall()}
            loading={opening}
            disabled={opening}
            className="bg-[var(--color-pg-accent-green)] text-white hover:bg-[var(--color-pg-accent-green-2)]"
          >
            <ExternalLink className="h-4 w-4" />
            Install on GitHub
          </Button>
          <div className="flex items-center gap-2 text-xs text-light/55">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Waiting for install to complete…
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </section>
  )
}

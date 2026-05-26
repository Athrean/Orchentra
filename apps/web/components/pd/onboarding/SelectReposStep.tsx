'use client'

import * as React from 'react'
import { ArrowRight, GitBranch, Lock, Search } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface SelectReposStepProps {
  onComplete: () => void
}

interface RepoRow {
  id: number
  name: string
  fullName: string
  private: boolean
  defaultBranch: string
}

interface InstallationGroup {
  installationId: number
  accountLogin: string
  repos: RepoRow[]
}

export function SelectReposStep({ onComplete }: SelectReposStepProps) {
  const [groups, setGroups] = React.useState<InstallationGroup[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [q, setQ] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/github/repos')
      if (!res.ok) throw new Error(`failed to load repos (${res.status})`)
      const data = (await res.json()) as { installations: InstallationGroup[] }
      setGroups(data.installations)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load repos')
    } finally {
      setLoading(false)
    }
  }

  const allRepos = React.useMemo(
    () =>
      groups.flatMap((g) =>
        g.repos.map((r) => ({ ...r, installationId: g.installationId, accountLogin: g.accountLogin })),
      ),
    [groups],
  )

  const filtered = React.useMemo(() => {
    if (!q) return allRepos
    const term = q.toLowerCase()
    return allRepos.filter((r) => r.fullName.toLowerCase().includes(term))
  }, [allRepos, q])

  function toggle(fullName: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(fullName)) next.delete(fullName)
      else next.add(fullName)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filtered.map((r) => r.fullName)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  async function submit() {
    if (selected.size === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const repos = allRepos
        .filter((r) => selected.has(r.fullName))
        .map((r) => ({ installationId: r.installationId, repoFullName: r.fullName, repoId: r.id }))
      const res = await fetch('/api/onboarding/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repos }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `subscribe failed (${res.status})`)
      }
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'subscribe failed')
      setSubmitting(false)
    }
  }

  return (
    <section className="flex w-full flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-light">Pick your repos</h2>
        <p className="max-w-md text-sm text-light/70">
          Choose which repos Orchentra should surface on your dashboard. You can change this any time.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-light/40" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search repos…" className="pl-9" />
        </div>
        <div className="flex items-center justify-between text-xs text-light/65">
          <span>
            {selected.size} selected · {filtered.length} {filtered.length === 1 ? 'repo' : 'repos'}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={selectAll} className="hover:text-light">
              Select all
            </button>
            <span className="text-light/30">·</span>
            <button type="button" onClick={clearAll} className="hover:text-light">
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03]">
        {loading && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-sm text-light/60">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-light/30 border-t-light" />
            Loading repos…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-light/60">No repos match.</div>
        )}
        {!loading && filtered.length > 0 && (
          <ul className="divide-y divide-white/5">
            {filtered.map((r) => {
              const isSel = selected.has(r.fullName)
              return (
                <li key={r.fullName}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(r.fullName)}
                      className="h-4 w-4 rounded border-white/20 bg-transparent accent-[var(--color-pg-accent-green-2)]"
                    />
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate text-sm text-light">{r.fullName}</span>
                      {r.private && (
                        <span title="Private" className="text-light/40">
                          <Lock className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-light/45">
                      <GitBranch className="h-3 w-3" />
                      {r.defaultBranch}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={() => void submit()}
          disabled={selected.size === 0 || submitting}
          loading={submitting}
          className="bg-[var(--color-pg-accent-green)] text-white hover:bg-[var(--color-pg-accent-green-2)]"
        >
          Continue to dashboard
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  )
}

'use client'

import { useState, useMemo, useEffect } from 'react'
import { AlertTriangle, Check, GitBranch, Loader2, Search, Globe, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useRouter } from 'next/navigation'
import { useMe, useAvailableRepos, useMonitorRepo, useValidateRepo, type ValidatedRepo } from '../../lib/hooks'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

export function OrgSelector() {
  const router = useRouter()
  const { data: me, isLoading: userLoading, isError: userError } = useMe()
  const user = me?.user
  const { data: repos, isLoading: reposLoading, isError: reposError } = useAvailableRepos()
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)

  useEffect(() => {
    if (!repos || selectedRepo) return
    const first = repos.find((r) => r.monitored)
    if (first) setSelectedRepo(first.fullName)
  }, [repos, selectedRepo])

  const [search, setSearch] = useState('')
  const [publicInput, setPublicInput] = useState('')
  const [validatedPublic, setValidatedPublic] = useState<ValidatedRepo | null>(null)
  const monitorRepo = useMonitorRepo()
  const validateRepo = useValidateRepo()
  const [monitorError, setMonitorError] = useState<string | null>(null)

  const loading = userLoading || reposLoading

  const filteredRepos = useMemo(() => {
    if (!repos) return []
    const q = search.toLowerCase()
    if (!q) return repos
    return repos.filter(
      (r) => r.fullName.toLowerCase().includes(q) || (r.description?.toLowerCase().includes(q) ?? false),
    )
  }, [repos, search])

  async function handleValidatePublic() {
    if (!publicInput.trim()) return
    setValidatedPublic(null)
    try {
      const result = await validateRepo.mutateAsync(publicInput.trim())
      if (result.valid && result.repo) {
        setValidatedPublic(result.repo)
        setSelectedRepo(result.repo.fullName.toLowerCase())
      }
    } catch {
      // validateRepo.isError shows the message
    }
  }

  async function handleContinue() {
    if (!selectedRepo) return
    setMonitorError(null)
    const normalizedRepo = selectedRepo.toLowerCase()
    const alreadyMonitored = repos?.find((r) => r.fullName.toLowerCase() === normalizedRepo)?.monitored ?? false
    if (!alreadyMonitored) {
      try {
        await monitorRepo.mutateAsync(normalizedRepo)
      } catch {
        setMonitorError('Failed to set up monitoring. Please try again.')
        return
      }
    }
    router.push(`/dashboard/${encodeURIComponent(normalizedRepo)}`)
  }

  if (loading) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-app-text-subtle)' }} />
        </div>
      </Shell>
    )
  }

  if (userError || reposError) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <p className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
              Failed to load. Please refresh.
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell user={user}>
      <main className="flex-1 flex flex-col items-center pt-14 pb-12 px-4">
        {/* Hero */}
        <div className="text-center mb-10">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center mx-auto mb-5 border"
            style={{
              background: 'var(--color-app-raised)',
              borderColor: 'var(--color-app-border)',
            }}
          >
            <GitBranch className="w-5 h-5" style={{ color: 'var(--color-brand)' }} />
          </div>
          <h1
            className="text-3xl font-semibold mb-2 tracking-tight"
            style={{ color: 'var(--color-app-text)', fontFamily: 'var(--font-display)' }}
          >
            Select a repository
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
            Orchentra will monitor CI failures and investigate them automatically.
          </p>
        </div>

        <div className="w-full max-w-xl flex flex-col gap-3">
          {/* Your repos */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{
              background: 'var(--color-app-card)',
              borderColor: 'var(--color-app-border)',
            }}
          >
            <div className="p-3 pb-2">
              <Input
                icon={<Search className="w-3.5 h-3.5" />}
                trailing={
                  search ? (
                    <button onClick={() => setSearch('')} className="hover:text-white transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : undefined
                }
                type="text"
                placeholder="Search repositories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="px-3 pb-3">
              <div
                className="text-[10px] font-semibold tracking-widest uppercase mb-2 px-1"
                style={{ color: 'var(--color-app-text-subtle)' }}
              >
                Your Repositories ({filteredRepos.length})
              </div>

              <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
                {filteredRepos.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--color-app-text-subtle)' }}>
                    No repositories found
                  </p>
                )}
                {filteredRepos.map((repo) => {
                  const selected = selectedRepo === repo.fullName
                  return (
                    <button
                      key={repo.fullName}
                      onClick={() => {
                        setSelectedRepo(repo.fullName)
                        setValidatedPublic(null)
                      }}
                      className={cn(
                        'flex items-center justify-between p-2.5 rounded-xl text-left transition-colors border',
                        selected ? 'border-white/10 bg-white/5' : 'border-transparent hover:bg-white/3',
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border"
                          style={{
                            background: 'var(--color-app-raised)',
                            borderColor: 'var(--color-app-border)',
                          }}
                        >
                          <GitBranch className="w-3 h-3" style={{ color: 'var(--color-app-text-muted)' }} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: 'var(--color-app-text)' }}>
                            {repo.fullName}
                          </div>
                          {repo.description && (
                            <div
                              className="text-[11px] mt-0.5 truncate"
                              style={{ color: 'var(--color-app-text-subtle)' }}
                            >
                              {repo.description}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {repo.monitored && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                            monitored
                          </span>
                        )}
                        {repo.private && (
                          <span
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                            style={{
                              color: 'var(--color-app-text-subtle)',
                              background: 'var(--color-app-raised)',
                              borderColor: 'var(--color-app-border)',
                            }}
                          >
                            private
                          </span>
                        )}
                        {selected && (
                          <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Track any public repo */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{
              background: 'var(--color-app-card)',
              borderColor: 'var(--color-app-border)',
            }}
          >
            <div className="p-3">
              <div
                className="text-[10px] font-semibold tracking-widest uppercase mb-2.5 px-1"
                style={{ color: 'var(--color-app-text-subtle)' }}
              >
                Track any public repo
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    icon={<Globe className="w-3.5 h-3.5" />}
                    type="text"
                    placeholder="owner/repo or github.com/owner/repo"
                    value={publicInput}
                    onChange={(e) => {
                      setPublicInput(e.target.value)
                      setValidatedPublic(null)
                      validateRepo.reset()
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleValidatePublic()}
                  />
                </div>
                <Button
                  variant="primary"
                  size="md"
                  loading={validateRepo.isPending}
                  disabled={!publicInput.trim()}
                  onClick={handleValidatePublic}
                >
                  Validate
                </Button>
              </div>

              {validateRepo.isSuccess && !validatedPublic && (
                <p className="text-xs text-red-400 mt-2 px-1">Repository not found or not accessible.</p>
              )}
              {validateRepo.isError && <p className="text-xs text-red-400 mt-2 px-1">Validation failed. Try again.</p>}

              {validatedPublic && (
                <button
                  onClick={() => setSelectedRepo(validatedPublic.fullName.toLowerCase())}
                  className={cn(
                    'mt-2.5 flex items-center justify-between w-full p-2.5 rounded-xl text-left border transition-colors',
                    selectedRepo === validatedPublic.fullName.toLowerCase()
                      ? 'border-white/10 bg-white/5'
                      : 'border-transparent hover:bg-white/3',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border"
                      style={{
                        background: 'var(--color-app-raised)',
                        borderColor: 'var(--color-app-border)',
                      }}
                    >
                      <Globe className="w-3 h-3 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--color-app-text)' }}>
                        {validatedPublic.fullName}
                      </div>
                      {validatedPublic.description && (
                        <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-app-text-subtle)' }}>
                          {validatedPublic.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                      valid
                    </span>
                    {selectedRepo === validatedPublic.fullName.toLowerCase() && (
                      <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8 flex flex-col items-center gap-2">
          <Button
            variant="green"
            size="lg"
            disabled={!selectedRepo}
            loading={monitorRepo.isPending}
            onClick={handleContinue}
            className="rounded-full px-6"
          >
            {monitorRepo.isPending ? 'Setting up…' : 'Continue →'}
          </Button>
          {monitorError && <p className="text-xs text-red-400">{monitorError}</p>}
        </div>
      </main>
    </Shell>
  )
}

function Shell({
  children,
  user,
}: {
  children: React.ReactNode
  user?: { avatarUrl?: string | null; displayName?: string | null; username: string } | null
}) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'var(--color-app-bg)',
        color: 'var(--color-app-text)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Minimal header */}
      <header
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: 'var(--color-app-border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex items-end gap-[3px]" style={{ color: 'var(--color-brand)' }}>
            <div className="w-[4px] h-2.5 rounded-full bg-current" />
            <div className="w-[4px] h-3.5 rounded-full bg-current" style={{ marginBottom: 1 }} />
            <div className="w-[4px] h-2.5 rounded-full bg-current" style={{ marginTop: 1 }} />
            <div className="w-[4px] h-2 rounded-full bg-current" style={{ marginTop: 2 }} />
          </div>
          <span
            className="text-[11px] font-semibold tracking-wide"
            style={{ color: 'var(--color-app-text-secondary)', fontFamily: 'var(--font-display)' }}
          >
            ORCHENTRA
          </span>
        </div>

        {/* User pill */}
        {user && (
          <div className="flex items-center gap-2">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-orange-500 to-red-500" />
            )}
            <span className="text-xs font-medium" style={{ color: 'var(--color-app-text-secondary)' }}>
              {user.displayName || user.username}
            </span>
          </div>
        )}
      </header>

      {children}
    </div>
  )
}

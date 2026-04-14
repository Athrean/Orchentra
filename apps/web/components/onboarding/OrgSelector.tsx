'use client'

import { useState, useMemo, useEffect } from 'react'
import { AlertTriangle, Check, Globe, Loader2, Lock, LogOut, Search, X } from 'lucide-react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../lib/utils'
import { useRouter } from 'next/navigation'
import { useMe, useAvailableRepos, useMonitorRepo, useValidateRepo, type ValidatedRepo } from '../../lib/hooks'
import { api } from '../../lib/api'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { GithubIcon } from '../../app/components/icons'

export function OrgSelector(): React.ReactElement {
  const router = useRouter()
  const { data: me, isLoading: userLoading, isError: userError } = useMe()
  const user = me?.user
  const { data: repos, isLoading: reposLoading, isError: reposError } = useAvailableRepos()
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)

  useEffect(() => {
    if (!repos || selectedRepo) return
    const first = repos.find((r) => r.monitored)
    if (first) setSelectedRepo(first.fullName.toLowerCase())
  }, [repos, selectedRepo])

  const [search, setSearch] = useState('')
  const [publicInput, setPublicInput] = useState('')
  const [validatedPublic, setValidatedPublic] = useState<ValidatedRepo | null>(null)
  const [activeTab, setActiveTab] = useState<'repos' | 'public'>('repos')
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
        setActiveTab('public')
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

  async function handleLogout(): Promise<void> {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    window.location.href = '/'
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
    <Shell user={user} onLogout={handleLogout}>
      <main className="flex-1 min-h-0 flex flex-col items-center px-4 pt-6 pb-4">
        <div className="w-full max-w-[560px] flex flex-col mt-5">
          <div
            className="rounded-[22px] p-2 h-[470px]"
            style={{
              background: 'var(--color-onboard-panel)',
              border: '1px solid var(--color-onboard-border)',
              boxShadow: 'var(--shadow-onboard-panel)',
            }}
          >
            <div
              className="grid grid-cols-2 gap-1 p-1 rounded-xl relative transition-all duration-300"
              style={{
                background: 'var(--color-onboard-rail)',
                border: '1px solid var(--color-onboard-border)',
                boxShadow: 'var(--shadow-onboard-rail)',
              }}
            >
              <motion.div
                layoutId="onboarding-tab-highlight"
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                className={cn(
                  'absolute top-1 bottom-1 rounded-lg',
                  activeTab === 'repos' ? 'left-1 right-[50%]' : 'right-1 left-[50%]',
                )}
                style={{ background: 'var(--color-onboard-selected)' }}
              />
              <button
                type="button"
                onClick={() => setActiveTab('repos')}
                className={cn(
                  'relative z-10 h-8 rounded-lg text-[12px] font-medium transition-colors',
                  activeTab === 'repos'
                    ? 'text-(--color-onboard-text)'
                    : 'text-(--color-onboard-text-secondary) hover:text-(--color-onboard-text)',
                )}
              >
                Your Repositories
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('public')}
                className={cn(
                  'relative z-10 h-8 rounded-lg text-[12px] font-medium transition-colors',
                  activeTab === 'public'
                    ? 'text-(--color-onboard-text)'
                    : 'text-(--color-onboard-text-secondary) hover:text-(--color-onboard-text)',
                )}
              >
                Track Public Repo
              </button>
            </div>

            <div className="mt-1.5 h-[calc(100%-2.6rem)] min-h-0">
              <AnimatePresence mode="wait">
                {activeTab === 'repos' ? (
                  <motion.div
                    key="repos"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="h-full min-h-0 flex flex-col"
                  >
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
                      placeholder="Search repositories..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="border-0 focus:border-0 rounded-lg h-9 text-sm bg-(--color-onboard-input) text-(--color-onboard-text) placeholder:text-(--color-onboard-text-subtle)"
                    />

                    <div
                      className="text-[9px] font-semibold tracking-widest uppercase mt-2 mb-1.5 px-1"
                      style={{ color: 'var(--color-onboard-text-subtle)' }}
                    >
                      Your Repositories ({filteredRepos.length})
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
                      {filteredRepos.length === 0 && (
                        <p className="text-xs text-center py-4" style={{ color: 'var(--color-onboard-text-subtle)' }}>
                          No repositories found
                        </p>
                      )}
                      {filteredRepos.map((repo) => {
                        const selected = selectedRepo === repo.fullName.toLowerCase()
                        return (
                          <button
                            key={repo.fullName}
                            onClick={() => {
                              setSelectedRepo(repo.fullName.toLowerCase())
                              setValidatedPublic(null)
                            }}
                            className={cn(
                              'w-full flex items-center justify-between p-2 rounded-lg text-left border transition-all duration-300',
                              selected ? 'border-white/8' : 'border-transparent hover:border-white/8',
                            )}
                            style={{
                              background: selected ? 'var(--color-onboard-selected)' : 'transparent',
                              boxShadow: selected ? 'var(--shadow-onboard-row)' : 'none',
                            }}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                                style={{ background: 'var(--color-onboard-raised)' }}
                              >
                                <GithubIcon className="w-3 h-3 text-(--color-onboard-text-secondary)" />
                              </div>
                              <div className="min-w-0">
                                <div
                                  className="text-[13px] font-medium truncate"
                                  style={{ color: 'var(--color-onboard-text)' }}
                                >
                                  {repo.fullName}
                                </div>
                                {repo.description && (
                                  <div
                                    className="text-[10px] mt-0.5 truncate"
                                    style={{ color: 'var(--color-onboard-text-subtle)' }}
                                  >
                                    {repo.description}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {repo.monitored && (
                                <span
                                  className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                                  style={{
                                    color: 'var(--color-accent)',
                                    background: 'var(--color-accent-dim)',
                                  }}
                                >
                                  monitored
                                </span>
                              )}
                              {repo.private && (
                                <span
                                  className="text-[9px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                                  style={{
                                    color: 'var(--color-onboard-text-subtle)',
                                    background: 'var(--color-onboard-raised)',
                                  }}
                                >
                                  <Lock className="w-2.5 h-2.5" />
                                  private
                                </span>
                              )}
                              {selected && (
                                <div className="w-3.5 h-3.5 rounded-full bg-accent flex items-center justify-center">
                                  <Check className="w-2 h-2 text-white" strokeWidth={3} />
                                </div>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="public"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="h-full flex flex-col"
                  >
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
                          className="border-0 focus:border-0 rounded-lg h-9 text-sm bg-(--color-onboard-input) text-(--color-onboard-text) placeholder:text-(--color-onboard-text-subtle)"
                        />
                      </div>
                      <Button
                        variant="primary"
                        size="md"
                        loading={validateRepo.isPending}
                        disabled={!publicInput.trim()}
                        onClick={handleValidatePublic}
                        className="border-0 bg-accent hover:bg-accent-hover text-white h-9 px-3 text-[11px]"
                      >
                        Validate
                      </Button>
                    </div>

                    {validateRepo.isSuccess && !validatedPublic && (
                      <p className="text-xs text-red-400 mt-2 px-1">Repository not found or not accessible.</p>
                    )}
                    {validateRepo.isError && (
                      <p className="text-xs text-red-400 mt-2 px-1">Validation failed. Try again.</p>
                    )}

                    <div className="mt-3 flex-1 min-h-0">
                      {validatedPublic && (
                        <button
                          onClick={() => setSelectedRepo(validatedPublic.fullName.toLowerCase())}
                          className={cn(
                            'w-full flex items-center justify-between p-2 rounded-lg text-left border transition-all duration-300',
                            selectedRepo === validatedPublic.fullName.toLowerCase()
                              ? 'border-white/8'
                              : 'border-transparent hover:border-white/8',
                          )}
                          style={{
                            background:
                              selectedRepo === validatedPublic.fullName.toLowerCase()
                                ? 'var(--color-onboard-selected)'
                                : 'transparent',
                            boxShadow:
                              selectedRepo === validatedPublic.fullName.toLowerCase()
                                ? 'var(--shadow-onboard-row)'
                                : 'none',
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-emerald-500/20">
                              <Globe className="w-3 h-3 text-emerald-300" />
                            </div>
                            <div>
                              <div className="text-[13px] font-medium" style={{ color: 'var(--color-onboard-text)' }}>
                                {validatedPublic.fullName}
                              </div>
                              {validatedPublic.description && (
                                <div
                                  className="text-[10px] mt-0.5 truncate"
                                  style={{ color: 'var(--color-onboard-text-subtle)' }}
                                >
                                  {validatedPublic.description}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full text-emerald-300 bg-emerald-500/20">
                              valid
                            </span>
                            {selectedRepo === validatedPublic.fullName.toLowerCase() && (
                              <div className="w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center">
                                <Check className="w-2 h-2 text-black" strokeWidth={3} />
                              </div>
                            )}
                          </div>
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center gap-1.5">
          <Button
            variant="green"
            size="md"
            disabled={!selectedRepo}
            loading={monitorRepo.isPending}
            onClick={handleContinue}
            className="rounded-full px-6 border-0 bg-accent hover:bg-accent-hover text-white"
          >
            {monitorRepo.isPending ? 'Setting up...' : 'Continue ->'}
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
  onLogout,
}: {
  children: React.ReactNode
  user?: { avatarUrl?: string | null; displayName?: string | null; username: string } | null
  onLogout?: () => Promise<void> | void
}): React.ReactElement {
  return (
    <div
      className="h-screen overflow-hidden flex flex-col"
      style={{
        background:
          'radial-gradient(80% 120% at 50% -10%, rgba(255,255,255,0.03), transparent 52%), var(--color-onboard-bg)',
        color: 'var(--color-onboard-text)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <header className="flex items-center justify-between px-6 py-5 md:py-6">
        <div className="flex items-center">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
            <Image
              src="/green-logo.png"
              alt="Orchentra"
              width={76}
              height={76}
              className="absolute h-[76px] w-auto max-w-none object-contain"
            />
          </div>
          <span className="hero-text -ml-1 font-serif text-[34px] tracking-tight md:text-[38px]">Orchentra</span>
        </div>

        {user && (
          <div
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-full transition-all duration-300"
            style={{
              background: 'var(--color-onboard-panel)',
              border: '1px solid var(--color-onboard-border)',
              boxShadow: 'var(--shadow-onboard-pill)',
            }}
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-linear-to-tr from-orange-500 to-red-500" />
            )}
            <span className="text-[13px] font-medium" style={{ color: 'var(--color-onboard-text)' }}>
              {user.displayName || user.username}
            </span>
            <button
              type="button"
              onClick={() => onLogout?.()}
              className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
              style={{ color: 'var(--color-onboard-text-secondary)', background: 'var(--color-onboard-raised)' }}
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </header>

      {children}
    </div>
  )
}

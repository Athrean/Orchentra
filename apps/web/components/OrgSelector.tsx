'use client'

import { useState, useMemo, useEffect } from 'react'
import { AlertTriangle, Check, Folder, Loader2, Search, Globe, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { useRouter } from 'next/navigation'
import { useMe, useAvailableRepos, useMonitorRepo, useValidateRepo, type ValidatedRepo } from '../lib/hooks'

export function OrgSelector() {
  const router = useRouter()
  const { data: me, isLoading: userLoading, isError: userError } = useMe()
  const user = me?.user
  const { data: repos, isLoading: reposLoading, isError: reposError } = useAvailableRepos()
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)

  // Auto-select the first already-monitored repo on load
  useEffect(() => {
    if (!repos || selectedRepo) return
    const first = repos.find((r) => r.monitored)
    if (first) setSelectedRepo(first.fullName.toLowerCase())
  }, [repos, selectedRepo])
  const [search, setSearch] = useState('')
  const [publicInput, setPublicInput] = useState('')
  const [validatedPublic, setValidatedPublic] = useState<ValidatedRepo | null>(null)
  const monitorRepo = useMonitorRepo()
  const validateRepo = useValidateRepo()

  const loading = userLoading || reposLoading

  const filteredRepos = useMemo(() => {
    if (!repos) return []
    const q = search.toLowerCase()
    if (!q) return repos
    return repos.filter(
      (r) => r.fullName.toLowerCase().includes(q) || (r.description?.toLowerCase().includes(q) ?? false),
    )
  }, [repos, search])

  const [monitorError, setMonitorError] = useState<string | null>(null)

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
      // validateRepo.isError will show the error message
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
      <div className="min-h-screen bg-[#0E1217] text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (userError || reposError) {
    return (
      <div className="min-h-screen bg-[#0E1217] text-white flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Failed to load. Please try again.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0E1217] text-white flex flex-col font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-linear-to-tr from-orange-500 to-red-500" />
          )}
          <span className="font-medium text-sm text-gray-200">{user?.displayName || user?.username}</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center pt-16 pb-12 px-4">
        <div className="flex flex-col items-center max-w-2xl w-full text-center mb-8">
          <div className="w-10 h-10 mb-6 rounded-full border-2 border-white/80 relative flex items-center justify-center">
            <div className="w-3 h-3 bg-white rounded-full absolute -right-1.5"></div>
          </div>
          <h1 className="text-4xl font-semibold mb-3 tracking-tight">Select a repository</h1>
          <p className="text-gray-400 text-sm max-w-xs">
            Choose a repository to monitor for CI failures and incidents.
          </p>
        </div>

        <div className="w-full max-w-2xl flex flex-col gap-4">
          {/* Your Repositories */}
          <div className="bg-[#151921] rounded-2xl border border-white/5 overflow-hidden shadow-xl">
            {/* Search */}
            <div className="p-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search repositories…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#0A0D11] border border-white/5 rounded-xl pl-8 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-white/15 transition-colors"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="px-4 pb-4">
              <div className="text-[10px] font-semibold tracking-wider text-gray-500 mb-2 px-1 uppercase">
                Your Repositories ({filteredRepos.length})
              </div>
              <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                {filteredRepos.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-4">No repositories match</p>
                )}
                {filteredRepos.map((repo) => (
                  <button
                    key={repo.fullName}
                    onClick={() => {
                      setSelectedRepo(repo.fullName)
                      setValidatedPublic(null)
                    }}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-xl text-left transition-colors',
                      selectedRepo === repo.fullName
                        ? 'bg-[#1E232B] border border-white/5'
                        : 'bg-[#0A0D11] hover:bg-[#1E232B]/50 border border-transparent',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center shrink-0">
                        <Folder className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{repo.fullName}</div>
                        {repo.description && (
                          <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{repo.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {repo.monitored && (
                        <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                          monitored
                        </span>
                      )}
                      {repo.private && (
                        <span className="text-[10px] font-medium text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                          private
                        </span>
                      )}
                      {selectedRepo === repo.fullName && (
                        <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                          <Check className="w-3 h-3 text-black" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Track any public repo */}
          <div className="bg-[#151921] rounded-2xl border border-white/5 overflow-hidden shadow-xl">
            <div className="p-4">
              <div className="text-[10px] font-semibold tracking-wider text-gray-500 mb-3 px-1 uppercase">
                Track any public repo
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input
                    type="text"
                    placeholder="owner/repo or github.com/owner/repo"
                    value={publicInput}
                    onChange={(e) => {
                      setPublicInput(e.target.value)
                      setValidatedPublic(null)
                      validateRepo.reset()
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleValidatePublic()}
                    className="w-full bg-[#0A0D11] border border-white/5 rounded-xl pl-8 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-white/15 transition-colors"
                  />
                </div>
                <button
                  onClick={handleValidatePublic}
                  disabled={!publicInput.trim() || validateRepo.isPending}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0',
                    publicInput.trim() && !validateRepo.isPending
                      ? 'bg-white/10 text-gray-200 hover:bg-white/15 cursor-pointer'
                      : 'bg-white/5 text-gray-600 cursor-not-allowed',
                  )}
                >
                  {validateRepo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Validate'}
                </button>
              </div>

              {/* Validation result */}
              {validateRepo.isSuccess && !validatedPublic && (
                <p className="text-xs text-red-400 mt-2 px-1">Repository not found or not accessible.</p>
              )}
              {validateRepo.isError && <p className="text-xs text-red-400 mt-2 px-1">Validation failed. Try again.</p>}
              {validatedPublic && (
                <button
                  onClick={() => setSelectedRepo(validatedPublic.fullName.toLowerCase())}
                  className={cn(
                    'mt-3 flex items-center justify-between w-full p-3 rounded-xl text-left transition-colors',
                    selectedRepo === validatedPublic.fullName.toLowerCase()
                      ? 'bg-[#1E232B] border border-white/5'
                      : 'bg-[#0A0D11] hover:bg-[#1E232B]/50 border border-transparent',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center shrink-0">
                      <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{validatedPublic.fullName}</div>
                      {validatedPublic.description && (
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{validatedPublic.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                      valid
                    </span>
                    {selectedRepo === validatedPublic.fullName.toLowerCase() && (
                      <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                        <Check className="w-3 h-3 text-black" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleContinue}
          disabled={!selectedRepo || monitorRepo.isPending}
          className={cn(
            'mt-8 px-5 py-2.5 rounded-full font-medium text-sm flex items-center gap-2 transition-all',
            selectedRepo && !monitorRepo.isPending
              ? 'bg-[#2EA043] text-white hover:bg-[#2C974B] hover:scale-105 cursor-pointer'
              : 'bg-[#2EA043]/30 text-white/50 cursor-not-allowed',
          )}
        >
          {monitorRepo.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Setting up...
            </>
          ) : (
            <>
              Continue <span className="text-lg leading-none">&rarr;</span>
            </>
          )}
        </button>
        {monitorError && <p className="mt-3 text-xs text-red-400">{monitorError}</p>}
      </main>
    </div>
  )
}

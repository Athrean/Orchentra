'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Folder, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { useRouter } from 'next/navigation'
import { useMe, useAvailableRepos, useMonitorRepo } from '../lib/hooks'

export function OrgSelector() {
  const router = useRouter()
  const { data: me, isLoading: userLoading, isError: userError } = useMe()
  const user = me?.user
  const { data: repos, isLoading: reposLoading, isError: reposError } = useAvailableRepos()
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const monitorRepo = useMonitorRepo()

  const loading = userLoading || reposLoading

  async function handleContinue() {
    if (!selectedRepo) return
    // Ensure the repo is monitored (idempotent — server ignores if already exists)
    // This also triggers the historical backfill for new repos
    await monitorRepo.mutateAsync(selectedRepo).catch(() => {})
    router.push(`/dashboard/${encodeURIComponent(selectedRepo)}`)
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
      <main className="flex-1 flex flex-col items-center pt-24 pb-12 px-4">
        <div className="flex flex-col items-center max-w-2xl w-full text-center mb-10">
          <div className="w-10 h-10 mb-6 rounded-full border-2 border-white/80 relative flex items-center justify-center">
            <div className="w-3 h-3 bg-white rounded-full absolute -right-1.5"></div>
          </div>
          <h1 className="text-4xl font-semibold mb-3 tracking-tight">Select a repository</h1>
          <p className="text-gray-400 text-sm max-w-xs">
            Choose a repository to monitor for CI failures and incidents.
          </p>
        </div>

        {/* Repos List */}
        <div className="bg-[#151921] rounded-2xl border border-white/5 w-full max-w-2xl overflow-hidden shadow-xl">
          <div className="p-4">
            <div className="text-[10px] font-semibold tracking-wider text-gray-500 mb-3 px-2 uppercase">
              Repositories ({repos?.length ?? 0})
            </div>
            <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {repos?.map((repo) => (
                <button
                  key={repo.fullName}
                  onClick={() => setSelectedRepo(repo.fullName)}
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
      </main>
    </div>
  )
}

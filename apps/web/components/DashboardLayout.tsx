'use client'

import { useState, useRef, useEffect } from 'react'
import { AlertTriangle, Radio, Settings, LogOut, GitBranch, ChevronDown, Check, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { useRouter } from 'next/navigation'
import { useMe, useAvailableRepos } from '../lib/hooks'
import { api } from '../lib/api'

export function DashboardLayout({
  children,
  repo,
  rightPanel,
}: {
  children: React.ReactNode
  repo: string
  rightPanel?: React.ReactNode
}) {
  const router = useRouter()
  const { data: me } = useMe()
  const { data: repos, isLoading: reposLoading } = useAvailableRepos()
  const user = me?.user
  const [repoPickerOpen, setRepoPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const monitoredRepos = repos?.filter((r) => r.monitored) ?? []

  // Close picker when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setRepoPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleLogout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    router.push('/')
  }

  function handleRepoSelect(r: string) {
    setRepoPickerOpen(false)
    if (r !== repo) router.push(`/dashboard/${encodeURIComponent(r)}`)
  }

  return (
    <div className="flex h-screen bg-[#0E1217] text-white overflow-hidden p-2 gap-2 font-sans">
      {/* Left Sidebar */}
      <aside className="w-[280px] bg-[#1A1D24] rounded-2xl flex flex-col p-4 border border-white/5 relative">
        <div className="flex items-center justify-between mb-8">
          {/* Logo */}
          <div className="flex items-center gap-1 text-[#FF4500] font-bold tracking-tighter">
            <div className="flex space-x-0.5">
              <div className="w-1.5 h-3 rounded-full bg-[#FF4500]"></div>
              <div className="w-1.5 h-4 mb-1 rounded-full bg-[#FF4500]"></div>
              <div className="w-1.5 h-3 mt-1 rounded-full bg-[#FF4500]"></div>
              <div className="w-1.5 h-2 mt-2 rounded-full bg-[#FF4500]"></div>
            </div>
          </div>
        </div>

        {/* Repo switcher */}
        <div ref={pickerRef} className="relative mb-6">
          <button
            onClick={() => setRepoPickerOpen((o) => !o)}
            className="w-full flex items-center gap-2 bg-black/40 rounded-xl p-3 border border-white/5 hover:border-white/10 transition-colors text-left"
          >
            <GitBranch className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm font-medium truncate flex-1">{repo}</span>
            {reposLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin shrink-0" />
            ) : (
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform',
                  repoPickerOpen && 'rotate-180',
                )}
              />
            )}
          </button>
          {repoPickerOpen && monitoredRepos.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#1A1D24] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="px-3 py-2 text-[10px] font-semibold tracking-wider text-gray-500 uppercase border-b border-white/5">
                Monitored repos
              </div>
              <div className="flex flex-col max-h-[200px] overflow-y-auto p-1.5">
                {monitoredRepos.map((r) => (
                  <button
                    key={r.fullName}
                    onClick={() => handleRepoSelect(r.fullName.toLowerCase())}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 text-left transition-colors"
                  >
                    <GitBranch className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="text-sm truncate flex-1">{r.fullName}</span>
                    {r.fullName.toLowerCase() === repo && <Check className="w-3.5 h-3.5 text-[#FF4500] shrink-0" />}
                  </button>
                ))}
              </div>
              <div className="border-t border-white/5 p-1.5">
                <button
                  onClick={() => {
                    setRepoPickerOpen(false)
                    router.push('/onboarding')
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 w-full text-left transition-colors"
                >
                  <span className="text-xs text-gray-400">+ Add or manage repos</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          <NavLink icon={<AlertTriangle className="w-4 h-4" />} label="Incidents" active />
          <NavLink icon={<Radio className="w-4 h-4" />} label="Monitoring" />
          <NavLink icon={<Settings className="w-4 h-4" />} label="Settings" />
        </nav>

        {/* User */}
        <div className="mt-auto">
          {user && (
            <div className="flex items-center gap-3 bg-[#21242C] p-3 rounded-xl border border-white/5">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-linear-to-tr from-orange-500 to-red-500" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user.displayName || user.username}</div>
                <div className="text-[11px] text-gray-500 truncate">@{user.username}</div>
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-white transition-colors"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-[#1A1D24] rounded-2xl relative border border-white/5 flex flex-col overflow-hidden">
        {children}
      </main>

      {/* Right Sidebar */}
      {rightPanel && (
        <aside className="w-[320px] bg-[#1A1D24] rounded-2xl border border-white/5 flex flex-col overflow-hidden">
          {rightPanel}
        </aside>
      )}
    </div>
  )
}

function NavLink({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 rounded-full transition-colors text-sm font-medium',
        active
          ? 'bg-white/5 border border-white/10 text-white'
          : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Radio, Settings, Sidebar as SidebarIcon, LogOut, GitBranch } from 'lucide-react'
import { cn } from '../lib/utils'
import { api } from '../lib/api'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

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
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    api<{ user: User }>('/api/me')
      .then((d) => setUser(d.user))
      .catch(() => {})
  }, [])

  async function handleLogout() {
    await fetch('http://localhost:3001/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    router.push('/')
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
          <button className="text-gray-400 hover:text-white transition-colors">
            <SidebarIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Repo badge */}
        <div className="flex items-center gap-2 bg-black/40 rounded-xl p-3 mb-6 border border-white/5">
          <GitBranch className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-sm font-medium truncate">{repo}</span>
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

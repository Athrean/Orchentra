'use client'

import { useState, useRef, useEffect } from 'react'
import {
  AlertTriangle,
  Radio,
  Settings,
  LogOut,
  GitBranch,
  ChevronDown,
  Check,
  Loader2,
  MessageSquare,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useRouter, usePathname } from 'next/navigation'
import { useMe, useAvailableRepos } from '../../lib/hooks'
import { api } from '../../lib/api'
import { ConnectionStatusBadge, type WsConnectionState } from './ConnectionStatusBadge'

export function DashboardLayout({
  children,
  repo,
  rightPanel,
  wsState,
}: {
  children: React.ReactNode
  repo: string
  rightPanel?: React.ReactNode
  wsState?: WsConnectionState
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: me } = useMe()
  const { data: repos, isLoading: reposLoading } = useAvailableRepos()
  const user = me?.user
  const [repoPickerOpen, setRepoPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const activeNav = pathname.endsWith('/chat')
    ? 'chat'
    : pathname.endsWith('/monitoring')
      ? 'monitoring'
      : pathname.endsWith('/settings')
        ? 'settings'
        : 'incidents'

  const monitoredRepos = repos?.filter((r) => r.monitored) ?? []

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
    window.location.href = '/'
  }

  function handleRepoSelect(r: string) {
    setRepoPickerOpen(false)
    if (r !== repo) router.push(`/dashboard/${encodeURIComponent(r)}`)
  }

  return (
    <div
      className="flex h-screen text-white overflow-hidden p-2 gap-2"
      style={{ background: 'var(--color-app-bg)', fontFamily: 'var(--font-body)' }}
    >
      {/* ── Left Sidebar ── */}
      <aside
        className="w-[260px] flex flex-col rounded-2xl border shrink-0"
        style={{
          background: 'var(--color-app-panel)',
          borderColor: 'var(--color-app-border)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center px-4 pt-4 pb-3">
          <LogoMark />
        </div>

        {/* Repo switcher */}
        <div ref={pickerRef} className="relative px-3 pb-3">
          <button
            onClick={() => setRepoPickerOpen((o) => !o)}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 border text-left transition-colors hover:border-white/10 group"
            style={{
              background: 'var(--color-app-deep)',
              borderColor: 'var(--color-app-border)',
            }}
          >
            <GitBranch className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-app-text-muted)' }} />
            <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--color-app-text)' }}>
              {repo}
            </span>
            {reposLoading ? (
              <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: 'var(--color-app-text-subtle)' }} />
            ) : (
              <ChevronDown
                className={cn('w-3 h-3 shrink-0 transition-transform', repoPickerOpen && 'rotate-180')}
                style={{ color: 'var(--color-app-text-subtle)' }}
              />
            )}
          </button>

          {repoPickerOpen && monitoredRepos.length > 0 && (
            <div
              className="absolute top-full left-3 right-3 mt-1 rounded-xl border shadow-2xl z-50 overflow-hidden"
              style={{
                background: 'var(--color-app-raised)',
                borderColor: 'var(--color-app-border-hover)',
              }}
            >
              <div
                className="px-3 py-2 text-[10px] font-semibold tracking-widest uppercase border-b"
                style={{ color: 'var(--color-app-text-subtle)', borderColor: 'var(--color-app-border)' }}
              >
                Monitored repos
              </div>
              <div className="flex flex-col max-h-[200px] overflow-y-auto p-1">
                {monitoredRepos.map((r) => (
                  <button
                    key={r.fullName}
                    onClick={() => handleRepoSelect(r.fullName.toLowerCase())}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-left transition-colors"
                  >
                    <GitBranch className="w-3 h-3 shrink-0" style={{ color: 'var(--color-app-text-subtle)' }} />
                    <span className="text-xs truncate flex-1" style={{ color: 'var(--color-app-text)' }}>
                      {r.fullName}
                    </span>
                    {r.fullName.toLowerCase() === repo && (
                      <Check className="w-3 h-3 shrink-0" style={{ color: 'var(--color-brand)' }} />
                    )}
                  </button>
                ))}
              </div>
              <div className="border-t p-1" style={{ borderColor: 'var(--color-app-border)' }}>
                <button
                  onClick={() => {
                    setRepoPickerOpen(false)
                    router.push('/onboarding')
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 w-full text-left transition-colors"
                >
                  <span className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>
                    + Add or manage repos
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-4 mb-2" style={{ height: 1, background: 'var(--color-app-border)' }} />

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 px-3 flex-1">
          <NavItem
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="Incidents"
            active={activeNav === 'incidents'}
            onClick={() => router.push(`/dashboard/${encodeURIComponent(repo)}`)}
          />
          <NavItem
            icon={<MessageSquare className="w-3.5 h-3.5" />}
            label="Chat"
            active={activeNav === 'chat'}
            onClick={() => router.push(`/dashboard/${encodeURIComponent(repo)}/chat`)}
          />
          <NavItem
            icon={<Radio className="w-3.5 h-3.5" />}
            label="Monitoring"
            active={activeNav === 'monitoring'}
            onClick={() => router.push(`/dashboard/${encodeURIComponent(repo)}/monitoring`)}
          />
          <NavItem icon={<Settings className="w-3.5 h-3.5" />} label="Settings" active={activeNav === 'settings'} />
        </nav>

        {/* Connection status */}
        {wsState && (
          <div className="px-4 pb-1">
            <ConnectionStatusBadge state={wsState} />
          </div>
        )}

        {/* User card */}
        <div className="p-3 mt-auto">
          {user && (
            <div
              className="flex items-center gap-3 rounded-xl p-3 border"
              style={{
                background: 'var(--color-app-raised)',
                borderColor: 'var(--color-app-border)',
              }}
            >
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full ring-1 ring-white/10" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-orange-500 to-red-500" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: 'var(--color-app-text)' }}>
                  {user.displayName || user.username}
                </div>
                <div className="text-[10px] truncate" style={{ color: 'var(--color-app-text-subtle)' }}>
                  @{user.username}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="transition-colors hover:text-white"
                style={{ color: 'var(--color-app-text-subtle)' }}
                title="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main
        className="flex-1 rounded-2xl border flex flex-col overflow-hidden relative"
        style={{
          background: 'var(--color-app-panel)',
          borderColor: 'var(--color-app-border)',
        }}
      >
        {children}
      </main>

      {/* ── Right Sidebar ── */}
      {rightPanel && (
        <aside
          className="w-[300px] rounded-2xl border flex flex-col overflow-hidden shrink-0"
          style={{
            background: 'var(--color-app-panel)',
            borderColor: 'var(--color-app-border)',
          }}
        >
          {rightPanel}
        </aside>
      )}
    </div>
  )
}

function LogoMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-end gap-[3px]" style={{ color: 'var(--color-brand)' }}>
        <div className="w-[5px] h-3 rounded-full bg-current" />
        <div className="w-[5px] h-4 rounded-full bg-current" style={{ marginBottom: 1 }} />
        <div className="w-[5px] h-3 rounded-full bg-current" style={{ marginTop: 1 }} />
        <div className="w-[5px] h-2 rounded-full bg-current" style={{ marginTop: 2 }} />
      </div>
      <span
        className="text-xs font-semibold tracking-wide"
        style={{ color: 'var(--color-app-text-secondary)', fontFamily: 'var(--font-display)' }}
      >
        ORCHENTRA
      </span>
    </div>
  )
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors w-full text-left',
        active ? 'bg-white/6 border border-white/8 text-white' : 'border border-transparent hover:bg-white/4',
      )}
      style={!active ? { color: 'var(--color-app-text-muted)' } : undefined}
    >
      {icon}
      {label}
    </button>
  )
}

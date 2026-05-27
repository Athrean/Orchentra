'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Activity,
  BarChart3,
  Bell,
  CalendarClock,
  ChevronRight,
  Code2,
  Database,
  FlaskConical,
  PanelLeft,
  Play,
  Search,
  Settings,
  Sparkles,
  Telescope,
  UsersRound,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import { SidebarUser } from './SidebarUser'
import { CreateTeamModal } from './CreateTeamModal'

type RailIcon = ComponentType<{ className?: string; strokeWidth?: number }>

const STORAGE_KEY = 'orchentra:sidebar-collapsed'

const NAV_ITEMS: Array<{ href: string; label: string; icon: RailIcon }> = [
  { href: '/dashboard', label: 'Investigate', icon: Telescope },
  { href: '/runs', label: 'Traces', icon: Activity },
  { href: '/graph', label: 'Detections', icon: Search },
  { href: '/crons', label: 'Evals', icon: CalendarClock },
  { href: '/runs?view=analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/workspace', label: 'Triage', icon: Code2 },
]

interface Props {
  email: string | null | undefined
  fullName: string | null | undefined
  avatarUrl: string | null | undefined
}

export function AppSidebar({ email, fullName, avatarUrl }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [teamModalOpen, setTeamModalOpen] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  function toggle() {
    setCollapsed((current) => {
      const next = !current
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <aside
      className={cn(
        'relative z-20 m-2 flex h-[calc(100vh-1rem)] shrink-0 flex-col rounded-[18px] bg-white/95 text-pg-text-0 shadow-[0_18px_45px_-32px_rgba(15,15,14,0.55),0_0_0_1px_rgba(20,20,18,0.08)] backdrop-blur-sm transition-[width] duration-200',
        collapsed ? 'w-[60px] items-center px-2 py-4' : 'w-[250px] px-5 py-5',
      )}
    >
      <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3')}>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'group relative flex items-center rounded-[10px] text-pg-text-mute outline-none transition-colors hover:bg-pg-surface-1 hover:text-pg-text-0 focus-visible:bg-pg-surface-1 focus-visible:text-pg-text-0',
            collapsed ? 'h-9 w-9 justify-center' : 'min-w-0 gap-3 pr-2',
          )}
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
            <Image
              src="/stripped.png"
              alt=""
              width={24}
              height={24}
              priority
              className="h-6 w-6 object-contain opacity-75 transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0"
            />
            <PanelLeft
              className={cn(
                'absolute h-[18px] w-[18px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
                collapsed && 'rotate-180',
              )}
              strokeWidth={1.7}
            />
          </span>
          {!collapsed ? (
            <span className="truncate text-[23px] font-medium tracking-tight text-pg-text-mute">Orchentra</span>
          ) : null}
          {collapsed ? <RailTooltip>Expand sidebar</RailTooltip> : null}
        </button>
      </div>

      <nav className={cn('flex flex-1 flex-col', collapsed ? 'mt-5 items-center' : 'mt-8')}>
        <div className={cn('flex flex-col', collapsed ? 'items-center gap-2' : 'gap-1.5')}>
          <TeamButton collapsed={collapsed} onClick={() => setTeamModalOpen(true)} />
          {NAV_ITEMS.slice(0, 3).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return <SidebarItem key={item.label} {...item} active={active} collapsed={collapsed} />
          })}
          <ExperimentsMenu collapsed={collapsed} />
          {NAV_ITEMS.slice(3).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return <SidebarItem key={item.label} {...item} active={active} collapsed={collapsed} />
          })}
        </div>

        <div className={cn('mt-auto flex flex-col', collapsed ? 'items-center gap-2' : 'gap-1.5')}>
          <ActivityMenu collapsed={collapsed} />
          <SidebarItem
            href="/settings"
            label="Settings"
            icon={Settings}
            active={pathname.startsWith('/settings')}
            collapsed={collapsed}
          />
          <SidebarUser
            email={email}
            fullName={fullName}
            avatarUrl={avatarUrl}
            collapsed={collapsed}
            onCreateTeam={() => setTeamModalOpen(true)}
          />
        </div>
      </nav>

      <CreateTeamModal open={teamModalOpen} onOpenChange={setTeamModalOpen} />
    </aside>
  )
}

function SidebarItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  className,
}: {
  href: string
  label: string
  icon: RailIcon
  active?: boolean
  collapsed: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        'group relative flex items-center rounded-[8px] text-pg-text-mute outline-none transition-colors',
        'hover:bg-pg-surface-1 hover:text-pg-text-0 focus-visible:bg-pg-surface-1 focus-visible:text-pg-text-0',
        collapsed ? 'h-9 w-9 justify-center' : 'h-8 gap-3 px-2.5 text-sm',
        active && 'bg-pg-surface-1 text-pg-text-0',
        className,
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
      {collapsed ? <RailTooltip>{label}</RailTooltip> : <span className="truncate">{label}</span>}
    </Link>
  )
}

function SidebarButton({
  label,
  icon: Icon,
  collapsed,
  children,
}: {
  label: string
  icon: RailIcon
  collapsed: boolean
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'group relative flex items-center rounded-[8px] text-pg-text-mute outline-none transition-colors hover:bg-pg-surface-1 hover:text-pg-text-0 focus-visible:bg-pg-surface-1 focus-visible:text-pg-text-0',
        collapsed ? 'h-9 w-9 justify-center' : 'h-8 w-full gap-3 px-2.5 text-sm',
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
      {collapsed ? (
        <RailTooltip>{label}</RailTooltip>
      ) : (
        <>
          <span className="truncate">{label}</span>
          {children}
        </>
      )}
    </button>
  )
}

function TeamButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex items-center rounded-[8px] text-pg-text-0 outline-none transition-colors hover:bg-pg-surface-1 focus-visible:bg-pg-surface-1',
        collapsed ? 'mb-2 h-9 w-9 justify-center bg-pg-surface-0' : 'mb-5 h-9 gap-3 px-2.5 text-sm font-medium',
      )}
    >
      <UsersRound className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
      {collapsed ? <RailTooltip>Create team</RailTooltip> : <span>Create Team</span>}
    </button>
  )
}

function RailTooltip({ children }: { children: string }) {
  return (
    <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-60 -translate-y-1/2 whitespace-nowrap rounded-[7px] bg-[#111111] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity delay-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:hidden">
      {children}
    </span>
  )
}

function ExperimentsMenu({ collapsed }: { collapsed: boolean }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <SidebarButton label="Experiments" icon={FlaskConical} collapsed={collapsed}>
          <ChevronRight className="ml-auto h-4 w-4" />
        </SidebarButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="start"
          sideOffset={10}
          className="z-50 w-56 rounded-[12px] bg-white p-2 text-pg-text-0 shadow-[0_18px_45px_-24px_rgba(15,15,14,0.45),0_0_0_1px_rgba(20,20,18,0.08)]"
        >
          <div className="px-2 pb-1 pt-1 text-sm font-medium">Experiments</div>
          <DropdownMenu.Item asChild>
            <Link
              href="/workspace"
              className="flex cursor-pointer items-center gap-2.5 rounded-[9px] px-2 py-2 text-sm text-pg-text-mute outline-none hover:bg-pg-surface-1 hover:text-pg-text-0"
            >
              <Sparkles className="h-4 w-4" />
              Prompts
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/workspace"
              className="flex cursor-pointer items-center gap-2.5 rounded-[9px] px-2 py-2 text-sm text-pg-text-mute outline-none hover:bg-pg-surface-1 hover:text-pg-text-0"
            >
              <Play className="h-4 w-4" />
              Playground
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/runs"
              className="flex cursor-pointer items-center gap-2.5 rounded-[9px] px-2 py-2 text-sm text-pg-text-mute outline-none hover:bg-pg-surface-1 hover:text-pg-text-0"
            >
              <Database className="h-4 w-4" />
              Datasets
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function ActivityMenu({ collapsed }: { collapsed: boolean }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <SidebarButton label="Activity" icon={Bell} collapsed={collapsed} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="end"
          sideOffset={10}
          className="z-50 flex h-[390px] w-[500px] flex-col rounded-[12px] bg-white p-4 text-pg-text-0 shadow-[0_22px_60px_-28px_rgba(15,15,14,0.42),0_0_0_1px_rgba(20,20,18,0.08)]"
        >
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium">Activity</div>
            <div className="ml-auto flex items-center gap-2 text-xs text-pg-text-mute">
              Unreads
              <span className="flex h-6 w-10 items-center rounded-full bg-pg-surface-1 p-1">
                <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
              </span>
            </div>
          </div>
          <div className="mt-4 flex gap-2 text-sm">
            {['All', 'Mentions', 'Alerts'].map((tab, index) => (
              <button
                key={tab}
                type="button"
                className={cn(
                  'rounded-[8px] px-3 py-1.5 text-pg-text-mute transition-colors hover:bg-pg-surface-1 hover:text-pg-text-0',
                  index === 0 && 'bg-pg-surface-1 text-pg-text-0',
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="mb-5 flex h-12 w-12 rotate-[-4deg] items-center justify-center rounded-[14px] bg-pg-surface-0 shadow-[10px_0_0_-3px_rgba(246,246,244,0.95),-10px_0_0_-3px_rgba(246,246,244,0.95)]">
              <Bell className="h-5 w-5 text-pg-text-mute" />
            </span>
            <div className="text-sm font-medium">No notifications yet</div>
            <div className="mt-2 text-sm text-pg-text-mute">You are all caught up.</div>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

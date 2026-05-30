'use client'

import { ChevronDown, FolderGit2, Hand, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PermissionMode } from '../../../lib/ai/chat-request'
import { efforts, type Effort } from '../../../lib/ai/effort'
import { buildModelMenu, getModelLabel } from '../../../lib/ai/models'
import { cn } from '../../../lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const pillClass =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-pg-text-mute transition-colors hover:bg-pg-surface-1 hover:text-pg-text-0 outline-none data-[state=open]:bg-pg-surface-1 data-[state=open]:text-pg-text-0'

const EFFORT_LABELS: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', max: 'Max' }

function Pill({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuTrigger className={pillClass}>
      {children}
      <ChevronDown className="h-3 w-3 opacity-60" />
    </DropdownMenuTrigger>
  )
}

function CheckDot({ active }: { active: boolean }) {
  return <span className={cn('ml-auto h-1.5 w-1.5 rounded-full', active ? 'bg-pg-accent-green' : 'bg-transparent')} />
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors',
        on ? 'bg-pg-accent-green' : 'bg-pg-surface-2',
      )}
    >
      <span
        className={cn(
          'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
          on ? 'translate-x-3.5' : 'translate-x-0.5',
        )}
      />
    </span>
  )
}

export function ScopePicker({
  scope,
  onScope,
  repos = [],
}: {
  scope: string
  onScope: (scope: string) => void
  repos?: { fullName: string }[]
}) {
  const label = scope === 'all-repos' ? 'All repos' : scope.split('/').pop()
  return (
    <DropdownMenu>
      <Pill>
        <FolderGit2 className="h-3.5 w-3.5" />
        {label}
      </Pill>
      <DropdownMenuContent side="top">
        <DropdownMenuLabel>Work scope</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onScope('all-repos')}>
          All repos
          <CheckDot active={scope === 'all-repos'} />
        </DropdownMenuItem>
        {repos.map((repo) => (
          <DropdownMenuItem key={repo.fullName} onSelect={() => onScope(repo.fullName)}>
            {repo.fullName}
            <CheckDot active={scope === repo.fullName} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PermissionModePicker({
  mode,
  onMode,
}: {
  mode: PermissionMode
  onMode: (mode: PermissionMode) => void
}) {
  return (
    <DropdownMenu>
      <Pill>
        <Hand className="h-3.5 w-3.5" />
        {mode === 'ask' ? 'Ask' : 'Act'}
      </Pill>
      <DropdownMenuContent side="top" className="min-w-[16rem]">
        <DropdownMenuItem onSelect={() => onMode('ask')} className="flex-col items-start gap-0.5">
          <span className="flex w-full items-center text-pg-text-0">
            Ask before acting
            <CheckDot active={mode === 'ask'} />
          </span>
          <span className="text-xs text-pg-text-mute">Pauses so you can approve each action.</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMode('act')} className="flex-col items-start gap-0.5">
          <span className="flex w-full items-center text-pg-text-0">
            Act without asking
            <CheckDot active={mode === 'act'} />
          </span>
          <span className="text-xs text-pg-text-mute">Works without pausing for approval.</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ModelEffortPicker({
  model,
  onModel,
  effort,
  onEffort,
  adaptive,
  onAdaptive,
}: {
  model: string
  onModel: (model: string) => void
  effort: Effort
  onEffort: (effort: Effort) => void
  adaptive: boolean
  onAdaptive: (adaptive: boolean) => void
}) {
  const menu = buildModelMenu()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(pillClass, 'text-pg-text-0')}>
        {getModelLabel(model)}
        <span className="text-pg-text-mute">{EFFORT_LABELS[effort]}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="min-w-[13rem]">
        {menu.primary.map((option) => (
          <DropdownMenuItem key={option.id} onSelect={() => onModel(option.id)}>
            {option.label}
            <CheckDot active={model === option.id} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Zap className="h-3.5 w-3.5" />
            Effort
            <span className="ml-auto pr-1 text-xs text-pg-text-mute">{EFFORT_LABELS[effort]}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>Higher effort is more thorough but slower.</DropdownMenuLabel>
            {efforts.map((tier) => (
              <DropdownMenuItem key={tier} onSelect={() => onEffort(tier)}>
                {EFFORT_LABELS[tier]}
                <CheckDot active={effort === tier} />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                onAdaptive(!adaptive)
              }}
              className="gap-3"
            >
              <span className="flex flex-col">
                <span className="text-pg-text-0">Adaptive thinking</span>
                <span className="text-xs text-pg-text-mute">Can think for more complex tasks</span>
              </span>
              <span className="ml-auto">
                <Toggle on={adaptive} />
              </span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {menu.more.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>More models</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
              {menu.more.map((option) => (
                <DropdownMenuItem key={option.id} onSelect={() => onModel(option.id)}>
                  {option.label}
                  <CheckDot active={model === option.id} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

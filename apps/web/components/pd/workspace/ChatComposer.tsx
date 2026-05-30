'use client'

import type { ChatStatus, FileUIPart } from 'ai'
import { ArrowUp, Check, ChevronUp, Mic, Paperclip, Square, TerminalSquare, X, AudioLines } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../../lib/utils'
import { filterSlashCommands, parseSlashQuery, type SlashCommand } from '../../../lib/ai/commands'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

interface ChatComposerProps {
  value: string
  onValueChange: (value: string) => void
  onSend: () => void
  onStop?: () => void
  status: ChatStatus
  placeholder?: string
  autoFocus?: boolean
  /** Toolbar controls rendered on the bottom-left (scope / permission pickers). */
  toolbar?: ReactNode
  /** Extra actions rendered to the left of the send button (model picker / mic). */
  actions?: ReactNode
  /** Staged attachments + handlers. When onAddFiles is set, an attach button is shown. */
  files?: FileUIPart[]
  onAddFiles?: (files: FileList) => void
  onRemoveFile?: (index: number) => void
  onMic?: () => void
  micActive?: boolean
  /** Show write-back slash commands (act mode). Read commands always show. */
  allowActCommands?: boolean
}

const MAX = 8000

export function ChatComposer({
  value,
  onValueChange,
  onSend,
  onStop,
  status,
  placeholder,
  autoFocus,
  toolbar,
  actions,
  files = [],
  onAddFiles,
  onRemoveFile,
  onMic,
  micActive = false,
  allowActCommands = false,
}: ChatComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isBusy = status === 'submitted' || status === 'streaming'
  const canSend = value.trim().length > 0 || files.length > 0

  const slash = parseSlashQuery(value)
  const slashCommands = slash.active ? filterSlashCommands(slash.query, allowActCommands) : []
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [slashHighlight, setSlashHighlight] = useState(0)
  const showSlash = slash.active && !slashDismissed && slashCommands.length > 0

  useEffect(() => {
    setSlashDismissed(false)
    setSlashHighlight(0)
  }, [slash.query])

  const selectCommand = (command: SlashCommand) => {
    onValueChange(`${command.prompt} `)
    setSlashDismissed(true)
    ref.current?.focus()
  }

  const autosize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    autosize()
  }, [value])

  const submit = () => {
    if (!canSend || isBusy) return
    onSend()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlash) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashHighlight((h) => (h + 1) % slashCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashHighlight((h) => (h - 1 + slashCommands.length) % slashCommands.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectCommand(slashCommands[slashHighlight] ?? slashCommands[0])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashDismissed(true)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="relative">
      {showSlash && <SlashMenu commands={slashCommands} highlight={slashHighlight} onSelect={selectCommand} />}
      <div className="surface w-full overflow-hidden rounded-[18px] p-0">
        {files.length > 0 && (
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: '1fr' }}
          >
            <div className="overflow-hidden">
              <div className="flex flex-wrap gap-2 px-4 pt-3">
                {files.map((file, index) => (
                  <AttachmentChip
                    key={`${file.filename}-${index}`}
                    file={file}
                    onRemove={() => onRemoveFile?.(index)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="relative min-h-[5.75rem]">
          <textarea
            ref={ref}
            value={value}
            rows={1}
            onChange={(e) => onValueChange(e.target.value.slice(0, MAX))}
            onKeyDown={onKeyDown}
            placeholder={placeholder ?? 'How can I help you today?'}
            className="block max-h-60 min-h-[5.75rem] w-full resize-none bg-transparent px-5 pb-11 pr-32 pt-4 text-base leading-relaxed text-pg-text-0 caret-pg-accent-green outline-none placeholder:text-pg-text-mute"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,text/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) onAddFiles?.(e.target.files)
              e.target.value = ''
            }}
          />
          {onAddFiles && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
              className="absolute bottom-3 left-4 flex h-8 w-8 items-center justify-center rounded-full text-pg-text-mute transition-colors hover:bg-pg-surface-1 hover:text-pg-text-0"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          )}
          {onMic && <VoiceControls active={micActive} onMic={onMic} />}
        </div>

        <div className="flex min-h-12 items-center gap-1.5 border-t border-pg-hairline/70 px-3">
          {toolbar}
          <div className="flex-1" />
          {actions}
          <button
            type="button"
            onClick={isBusy ? onStop : submit}
            disabled={isBusy ? !onStop : !canSend}
            aria-label={isBusy ? 'Stop' : 'Send'}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30',
              isBusy
                ? 'bg-pg-inverse text-pg-inverse-text hover:bg-pg-inverse-hover'
                : 'bg-pg-accent-green text-white hover:bg-pg-accent-green-2',
            )}
          >
            {isBusy ? <Square className="h-3.5 w-3.5" fill="currentColor" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function SlashMenu({
  commands,
  highlight,
  onSelect,
}: {
  commands: SlashCommand[]
  highlight: number
  onSelect: (command: SlashCommand) => void
}) {
  return (
    <div className="surface absolute bottom-full left-0 z-30 mb-2 w-full max-w-md overflow-hidden rounded-[12px] p-1">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-pg-text-mute">
        <TerminalSquare className="h-3.5 w-3.5" />
        Commands
      </div>
      {commands.map((command, index) => (
        <button
          key={command.name}
          type="button"
          // onMouseDown (not onClick) so the textarea does not blur before selection runs.
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(command)
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-sm transition-colors',
            index === highlight ? 'bg-pg-surface-1 text-pg-text-0' : 'text-pg-text-mute hover:bg-pg-surface-1',
          )}
        >
          <span className="font-mono text-pg-text-0">/{command.name}</span>
          <span className="truncate text-xs text-pg-text-mute">{command.description}</span>
        </button>
      ))}
    </div>
  )
}

function VoiceControls({ active, onMic }: { active: boolean; onMic: () => void }) {
  return (
    <div className="absolute bottom-3 right-4 flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Voice input options"
          className="flex h-8 w-8 items-center justify-center rounded-full text-pg-text-mute outline-none transition-colors hover:bg-pg-surface-1 hover:text-pg-text-0 data-[state=open]:bg-pg-inverse data-[state=open]:text-pg-inverse-text"
        >
          <ChevronUp className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-72 p-2">
          <div className="px-2 py-1.5 text-xs text-pg-text-mute">Microphone</div>
          {['MacBook Pro Microphone', "RISHIT's iPhone Microphone", 'AirPods'].map((device, index) => (
            <DropdownMenuItem key={device} className="h-9">
              <span className="truncate">{device}</span>
              {index === 0 ? <Check className="ml-auto h-4 w-4 text-pg-accent-green" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              onMic()
            }}
            className="h-9"
          >
            <Mic className="h-4 w-4 text-pg-text-mute" />
            Hold to record
            <span className="ml-auto flex h-5 w-9 items-center rounded-full bg-pg-accent-green p-0.5">
              <span className="ml-auto h-4 w-4 rounded-full bg-white" />
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={onMic}
        aria-label={active ? 'Stop voice input' : 'Start voice input'}
        aria-pressed={active}
        title="Press and hold to record"
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full text-pg-text-mute transition-colors hover:bg-pg-surface-1 hover:text-pg-text-0',
          active && 'bg-pg-inverse text-pg-inverse-text',
        )}
      >
        <Mic className="h-4 w-4" />
      </button>
      <AudioLines className="h-5 w-5 text-pg-text-mute/80" />
    </div>
  )
}

function AttachmentChip({ file, onRemove }: { file: FileUIPart; onRemove: () => void }) {
  const isImage = file.mediaType.startsWith('image/')
  return (
    <div className="group relative">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={file.url}
          alt={file.filename ?? ''}
          className="h-14 w-14 rounded-[8px] border border-pg-hairline object-cover"
        />
      ) : (
        <div className="flex h-14 max-w-[10rem] items-center rounded-[8px] border border-pg-hairline bg-pg-surface-0 px-3 text-xs text-pg-text-0">
          <span className="truncate">{file.filename ?? file.mediaType}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove attachment"
        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-pg-inverse text-pg-inverse-text opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  )
}

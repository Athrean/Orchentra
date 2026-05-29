'use client'

import { useChat } from '@ai-sdk/react'
import { convertFileListToFileUIParts, DefaultChatTransport, type FileUIPart } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PermissionMode } from '../../../lib/ai/chat-request'
import type { Effort } from '../../../lib/ai/effort'
import { DEFAULT_MODEL_ID } from '../../../lib/ai/models'
import { ChatComposer } from './ChatComposer'
import { CoworkHero } from './CoworkHero'
import { CoworkMessage } from './CoworkMessage'
import { CoworkRail } from './CoworkRail'
import { ModelEffortPicker, PermissionModePicker, ScopePicker } from './ChatToolbar'

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly 0: { transcript: string }
}

interface SpeechRecognitionEventLike {
  readonly results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

export function CoworkSurface({
  initialPrompt,
  mode = 'triage',
}: {
  initialPrompt?: string | null
  mode?: 'investigate' | 'triage'
}) {
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID)
  const [effort, setEffort] = useState<Effort>('low')
  const [adaptive, setAdaptive] = useState(false)
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('ask')
  const [scope, setScope] = useState('all-repos')
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<FileUIPart[]>([])
  const [micActive, setMicActive] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const settingsRef = useRef({ model, effort, adaptive, permissionMode, scope })
  settingsRef.current = { model, effort, adaptive, permissionMode, scope }

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat', body: () => settingsRef.current }), [])
  const { messages, sendMessage, regenerate, status, stop, error } = useChat({ transport })
  const isBusy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (error) toast.error(error.message)
  }, [error])

  useEffect(() => () => recognitionRef.current?.stop(), [])

  // Seed the first turn from a deep link (?q=…) — fire once on mount.
  const seededRef = useRef(false)
  useEffect(() => {
    const seed = initialPrompt?.trim()
    if (seed && !seededRef.current) {
      seededRef.current = true
      void sendMessage({ text: seed })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, status])

  const addFiles = async (list: FileList) => {
    try {
      const parts = await convertFileListToFileUIParts(list)
      setFiles((current) => [...current, ...parts])
    } catch {
      toast.error('Could not read that file')
    }
  }
  const removeFile = (index: number) => setFiles((current) => current.filter((_, i) => i !== index))

  const submit = () => {
    const text = draft.trim()
    if ((!text && files.length === 0) || isBusy) return
    void sendMessage({ text, files: files.length ? files : undefined })
    setDraft('')
    setFiles([])
  }

  const toggleMic = () => {
    if (micActive) {
      recognitionRef.current?.stop()
      recognitionRef.current = null
      setMicActive(false)
      return
    }

    const Recognition = getSpeechRecognition()
    if (!Recognition) {
      toast.error('Voice input is not supported in this browser')
      return
    }

    const recognition = new Recognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript.trim())
        .filter(Boolean)
        .join(' ')
      if (transcript) setDraft((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript))
    }
    recognition.onerror = () => {
      toast.error('Voice input failed')
      setMicActive(false)
      recognitionRef.current = null
    }
    recognition.onend = () => {
      setMicActive(false)
      recognitionRef.current = null
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setMicActive(true)
    } catch {
      toast.error('Voice input failed')
      recognitionRef.current = null
    }
  }

  const regenerateMessage = (messageId: string) => {
    if (isBusy) return
    void regenerate({ messageId })
  }

  const toolbar = (
    <>
      <ScopePicker scope={scope} onScope={setScope} />
      <PermissionModePicker mode={permissionMode} onMode={setPermissionMode} />
    </>
  )
  const actions = (
    <ModelEffortPicker
      model={model}
      onModel={setModel}
      effort={effort}
      onEffort={setEffort}
      adaptive={adaptive}
      onAdaptive={setAdaptive}
    />
  )

  if (messages.length === 0) {
    return (
      <CoworkHero
        value={draft}
        onValueChange={setDraft}
        onSend={submit}
        onStop={stop}
        status={status}
        toolbar={toolbar}
        actions={actions}
        files={files}
        onAddFiles={addFiles}
        onRemoveFile={removeFile}
        onMic={toggleMic}
        micActive={micActive}
        mode={mode}
      />
    )
  }

  return (
    <div className="dot-canvas flex h-[calc(100vh-3.5rem)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 pt-8">
          <div className="mx-auto max-w-3xl">
            {messages.map((message) => (
              <CoworkMessage
                key={message.id}
                message={message}
                canRegenerate={!isBusy}
                onRegenerate={regenerateMessage}
              />
            ))}
            {status === 'submitted' && <ThinkingDots />}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className="px-4 pb-5">
          <div className="mx-auto max-w-3xl">
            <ChatComposer
              value={draft}
              onValueChange={setDraft}
              onSend={submit}
              onStop={stop}
              status={status}
              toolbar={toolbar}
              actions={actions}
              files={files}
              onAddFiles={addFiles}
              onRemoveFile={removeFile}
              onMic={toggleMic}
              micActive={micActive}
            />
          </div>
        </div>
      </div>
      <CoworkRail
        messages={messages}
        status={status}
        model={model}
        effort={effort}
        adaptive={adaptive}
        permissionMode={permissionMode}
        scope={scope}
      />
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="mb-6 flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pg-text-mute [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pg-text-mute [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pg-text-mute" />
    </div>
  )
}

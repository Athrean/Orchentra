import React, { useEffect, useRef, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { spawn } from 'node:child_process'
import { startAnthropicLogin, completeAnthropicLogin, type AnthropicPendingLogin } from '@orchentra/cli-api'
import { readClipboard, writeClipboard } from '../../ui/clipboard'
import { THEME } from '../theme'

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const CODE_PATTERN = /^[A-Za-z0-9_-]{16,}#[A-Za-z0-9_-]{16,}$/

export interface AnthropicLoginCardProps {
  readonly onComplete: (result: { ok: boolean; message: string; path?: string }) => void
}

type Phase =
  | { kind: 'waiting'; pending: AnthropicPendingLogin }
  | { kind: 'pasting'; pending: AnthropicPendingLogin; buffer: string }
  | { kind: 'exchanging' }
  | { kind: 'done'; ok: boolean; message: string }

export function AnthropicLoginCard(props: AnthropicLoginCardProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>(() => {
    const pending = startAnthropicLogin()
    return { kind: 'waiting', pending }
  })
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const initialClipRef = useRef<string>('')
  const completedRef = useRef(false)

  // Open browser + capture initial clipboard once.
  useEffect(() => {
    if (phase.kind !== 'waiting') return
    initialClipRef.current = (readClipboard() ?? '').trim()
    openInBrowser(phase.pending.authUrl)
  }, [phase.kind === 'waiting' ? phase.pending.authUrl : null])

  // Spinner.
  useEffect(() => {
    if (phase.kind !== 'waiting' && phase.kind !== 'exchanging') return
    const id = setInterval(() => setSpinnerFrame((f) => (f + 1) % SPINNER.length), 100)
    return () => clearInterval(id)
  }, [phase.kind])

  // Toast auto-clear.
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(id)
  }, [toast])

  // Clipboard polling — auto-detect pasted code.
  useEffect(() => {
    if (phase.kind !== 'waiting') return
    const id = setInterval(() => {
      const content = (readClipboard() ?? '').trim()
      if (!content || content === initialClipRef.current) return
      if (!CODE_PATTERN.test(content)) return
      void exchange(content, phase.pending)
    }, 300)
    return () => clearInterval(id)
  }, [phase.kind === 'waiting' ? phase.pending.verifier : null])

  async function exchange(pasted: string, pending: AnthropicPendingLogin): Promise<void> {
    if (completedRef.current) return
    completedRef.current = true
    setPhase({ kind: 'exchanging' })
    try {
      const result = await completeAnthropicLogin({ pasted, verifier: pending.verifier })
      setPhase({ kind: 'done', ok: true, message: 'Connected to Claude' })
      // Schedule onComplete after render so the success state flashes briefly.
      setTimeout(() => props.onComplete({ ok: true, message: 'Connected to Claude', path: result.persistedPath }), 600)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPhase({ kind: 'done', ok: false, message: msg })
      setTimeout(() => props.onComplete({ ok: false, message: msg }), 1200)
    }
  }

  useInput(
    (input, key) => {
      if (phase.kind === 'waiting') {
        if (input === 'q' || (key.ctrl && input === 'c') || key.escape) {
          completedRef.current = true
          props.onComplete({ ok: false, message: 'cancelled' })
          return
        }
        if (input === 'c') {
          const ok = writeClipboard(phase.pending.authUrl)
          setToast(ok ? '✓ URL copied to clipboard' : 'No clipboard tool available')
          return
        }
        if (input === 'p') {
          setPhase({ kind: 'pasting', pending: phase.pending, buffer: '' })
          return
        }
        return
      }

      if (phase.kind === 'pasting') {
        if (key.escape) {
          setPhase({ kind: 'waiting', pending: phase.pending })
          return
        }
        if (key.return) {
          const code = phase.buffer.trim()
          if (!code) {
            setPhase({ kind: 'waiting', pending: phase.pending })
            return
          }
          void exchange(code, phase.pending)
          return
        }
        if (key.backspace || key.delete) {
          setPhase({ ...phase, buffer: phase.buffer.slice(0, -1) })
          return
        }
        if (input && !key.ctrl && !key.meta) {
          setPhase({ ...phase, buffer: phase.buffer + input })
          return
        }
      }

      if (phase.kind === 'done') {
        if (key.return || key.escape) {
          props.onComplete({ ok: phase.ok, message: phase.message })
        }
      }
    },
    { isActive: true },
  )

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Sign in with Claude Pro / Max
      </Text>
      <Box height={1} />
      {renderPhase(phase, spinnerFrame, toast)}
      <Box height={1} />
      <Text dimColor>{renderHint(phase)}</Text>
    </Box>
  )
}

function renderPhase(phase: Phase, spinnerFrame: number, toast: string | null): React.ReactElement {
  if (phase.kind === 'waiting') {
    return (
      <Box flexDirection="column">
        <Text>
          <Text color={THEME.brand}>✓</Text> Browser opened to claude.ai
        </Text>
        <Text>
          <Text color={THEME.accent}>{SPINNER[spinnerFrame]}</Text> Waiting for code — copy it from the browser
        </Text>
        <Text dimColor>The code will be auto-detected from your clipboard.</Text>
        {toast ? <Text color={THEME.brand}>{toast}</Text> : null}
      </Box>
    )
  }

  if (phase.kind === 'pasting') {
    return (
      <Box flexDirection="column">
        <Text>Paste authorization code (Enter to submit, Esc to cancel):</Text>
        <Text>
          <Text color={THEME.accent}>›</Text> {phase.buffer}
          <Text color={THEME.accent}>█</Text>
        </Text>
      </Box>
    )
  }

  if (phase.kind === 'exchanging') {
    return (
      <Text>
        <Text color={THEME.accent}>{SPINNER[spinnerFrame]}</Text> Exchanging tokens…
      </Text>
    )
  }

  return (
    <Text>
      <Text color={phase.ok ? THEME.brand : THEME.danger}>{phase.ok ? '✓' : '✗'}</Text>{' '}
      <Text color={phase.ok ? THEME.brand : THEME.danger}>{phase.message}</Text>
    </Text>
  )
}

function renderHint(phase: Phase): string {
  if (phase.kind === 'waiting') return '[c] copy URL    [p] paste manually    [q] cancel'
  if (phase.kind === 'pasting') return 'Enter to submit · Esc to go back'
  if (phase.kind === 'exchanging') return 'Hang tight…'
  return phase.ok ? 'Press Enter to continue' : 'Press Enter to dismiss'
}

function openInBrowser(url: string): void {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
  try {
    const child = spawn(cmd, platform === 'win32' ? ['', url] : [url], {
      stdio: 'ignore',
      detached: true,
      shell: platform === 'win32',
    })
    child.on('error', () => {
      /* ignore — user can copy URL manually */
    })
    child.unref()
  } catch {
    /* ignore */
  }
}

import React, { useEffect, useRef, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { spawn } from 'node:child_process'
import { importCodexCliAuth, loginCodex } from '@orchentra/cli-api'
import { THEME } from '../theme'

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export interface CodexLoginCardProps {
  readonly onComplete: (result: { ok: boolean; message: string; path?: string }) => void
}

type Phase = { kind: 'waiting' } | { kind: 'exchanging' } | { kind: 'done'; ok: boolean; message: string }

export function CodexLoginCard(props: CodexLoginCardProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>({ kind: 'waiting' })
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const completedRef = useRef(false)
  const startedRef = useRef(false)

  // Kick off the flow once. Codex OAuth is loopback — the browser redirect
  // returns to a localhost server automatically, so there's no code to paste.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    // Zero-friction: reuse an existing official `codex login` if present.
    const imported = importCodexCliAuth()
    if (imported) {
      finish({ ok: true, message: 'Imported existing Codex CLI login' })
      return
    }

    void loginCodex({
      onAuthUrl: (url) => {
        setAuthUrl(url)
        openInBrowser(url)
      },
    })
      .then((r) => {
        const who = r.email ? ` (${r.email}${r.planType ? `, ${r.planType}` : ''})` : ''
        const next = r.mode === 'chatgpt' ? ' — run /model gpt-5.5 to use it' : ''
        finish({ ok: true, message: `Connected to OpenAI via ChatGPT${who}${next}`, path: r.persistedPath })
      })
      .catch((err: unknown) => {
        finish({ ok: false, message: err instanceof Error ? err.message : String(err) })
      })
  }, [])

  // Spinner while waiting / exchanging.
  useEffect(() => {
    if (phase.kind === 'done') return
    const id = setInterval(() => setSpinnerFrame((f) => (f + 1) % SPINNER.length), 100)
    return () => clearInterval(id)
  }, [phase.kind])

  function finish(result: { ok: boolean; message: string; path?: string }): void {
    if (completedRef.current) return
    completedRef.current = true
    setPhase({ kind: 'done', ok: result.ok, message: result.message })
    // Flash the terminal state briefly before dismissing the overlay.
    setTimeout(() => props.onComplete(result), result.ok ? 600 : 1200)
  }

  useInput(
    (input, key) => {
      if (phase.kind === 'done') {
        if (key.return || key.escape) props.onComplete({ ok: phase.ok, message: phase.message })
        return
      }
      if (input === 'q' || key.escape || (key.ctrl && input === 'c')) {
        // The loopback server closes on its own timeout; we just stop waiting.
        completedRef.current = true
        props.onComplete({ ok: false, message: 'cancelled' })
      }
    },
    { isActive: true },
  )

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text color={THEME.brand} bold>
        Sign in with ChatGPT Plus / Pro
      </Text>
      <Box height={1} />
      {renderPhase(phase, spinnerFrame, authUrl)}
      <Box height={1} />
      <Text dimColor>
        {phase.kind === 'done' ? (phase.ok ? 'Press Enter to continue' : 'Press Enter to dismiss') : '[q] cancel'}
      </Text>
    </Box>
  )
}

function renderPhase(phase: Phase, spinnerFrame: number, authUrl: string | null): React.ReactElement {
  if (phase.kind === 'done') {
    return (
      <Text>
        <Text color={phase.ok ? THEME.brand : THEME.danger}>{phase.ok ? '✓' : '✗'}</Text>{' '}
        <Text color={phase.ok ? THEME.brand : THEME.danger}>{phase.message}</Text>
      </Text>
    )
  }
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={THEME.accent}>{SPINNER[spinnerFrame]}</Text>{' '}
        {authUrl ? 'Approve access in the browser…' : 'Opening browser to ChatGPT…'}
      </Text>
      <Text dimColor>We&apos;ll detect the redirect automatically — no code to paste.</Text>
      {authUrl ? <Text dimColor>{`If the browser didn't open: ${authUrl}`}</Text> : null}
    </Box>
  )
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

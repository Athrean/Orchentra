'use client'

import { m } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

export type TerminalScenario = 'run' | 'outcome' | 'models' | 'install' | 'inspect' | 'plan' | 'build' | 'verify'

type TerminalTone = 'plain' | 'muted' | 'accent' | 'success'

interface TerminalLine {
  text: string
  tone?: TerminalTone
}

interface TerminalConfig {
  command: string
  screenTitle?: string
  screenBody?: string
  options?: readonly string[]
  selection?: 'single' | 'multiple'
  selected?: readonly number[]
  output: readonly TerminalLine[]
}

const terminalConfigs: Record<TerminalScenario, TerminalConfig> = {
  run: {
    command: 'orchentra run "Rebuild the landing page and verify every breakpoint"',
    screenTitle: 'Select the specialists for this run',
    screenBody: 'Use space to toggle, enter to start.',
    options: ['Explorer', 'Architect', 'Senior developer', 'Verifier'],
    selection: 'multiple',
    selected: [0, 1, 2, 3],
    output: [
      { text: '✓ repository instructions loaded', tone: 'success' },
      { text: '✓ Explorer mapped 23 relevant files', tone: 'success' },
      { text: '✓ Architect declared 4 completion gates', tone: 'success' },
      { text: '✓ Senior developer landed the bounded change', tone: 'success' },
      { text: '✓ typecheck · 0 errors', tone: 'success' },
      { text: '✓ production build · static export ready', tone: 'success' },
      { text: '✓ Chromium · 1440 / 810 / 390', tone: 'success' },
      { text: 'COMPLETE  evidence://run/00108', tone: 'accent' },
    ],
  },
  outcome: {
    command: 'orchentra run',
    screenTitle: 'Choose an outcome',
    screenBody: 'The completion policy stays attached to your choice.',
    options: [
      'Build settings and verify the keyboard flow',
      'Refactor the runtime across isolated worktrees',
      'Find the regression and close it with evidence',
    ],
    selection: 'single',
    selected: [0],
    output: [
      { text: '→ reading repository instructions', tone: 'muted' },
      { text: '→ classifying completion evidence', tone: 'muted' },
      { text: '✓ plan created · 3 bounded slices', tone: 'success' },
      { text: '✓ browser verification attached', tone: 'success' },
      { text: 'RUNNING  session://local/00109', tone: 'accent' },
    ],
  },
  models: {
    command: 'orchentra models',
    screenTitle: 'Choose a model profile',
    screenBody: 'Execution adapts. The proof standard does not.',
    options: [
      'OpenAI · Codex profile',
      'Anthropic · Claude profile',
      'Google · Gemini profile',
      'OpenRouter · Custom profile',
    ],
    selection: 'single',
    selected: [0],
    output: [
      { text: '✓ prompt dialect · structured tool loop', tone: 'success' },
      { text: '✓ edit strategy · patch with verification', tone: 'success' },
      { text: '✓ continuation · resume from run state', tone: 'success' },
      { text: '✓ context policy · trust boundary protected', tone: 'success' },
      { text: 'READY  bring your own provider key', tone: 'accent' },
    ],
  },
  install: {
    command: 'npm install -g @athreanlab/orchentra',
    output: [
      { text: 'added @athreanlab/orchentra', tone: 'plain' },
      { text: 'linked orchentra → /usr/local/bin/orchentra', tone: 'muted' },
      { text: 'linked otr → /usr/local/bin/otr', tone: 'muted' },
      { text: '✓ installation complete', tone: 'success' },
      { text: 'Next: orchentra run', tone: 'accent' },
    ],
  },
  inspect: {
    command: 'orchentra inspect',
    output: [
      { text: '→ reading AGENTS.md', tone: 'muted' },
      { text: '→ checking worktree and scripts', tone: 'muted' },
      { text: '✓ 23 relevant files mapped', tone: 'success' },
      { text: '✓ 6 standing decisions loaded', tone: 'success' },
      { text: 'READY  repository contract attached', tone: 'accent' },
    ],
  },
  plan: {
    command: 'orchentra plan --with-gates',
    output: [
      { text: '01  preserve existing route contracts', tone: 'plain' },
      { text: '02  land the bounded implementation', tone: 'plain' },
      { text: '03  run typecheck and production build', tone: 'plain' },
      { text: '04  operate desktop, tablet, and mobile', tone: 'plain' },
      { text: '✓ completion policy declared', tone: 'success' },
    ],
  },
  build: {
    command: 'orchentra run --resume 00108',
    screenTitle: 'Resume the specialist crew',
    screenBody: 'Every child draws from the parent run.',
    options: ['Developer · implementation', 'Reviewer · contract check', 'Verifier · evidence gate'],
    selection: 'multiple',
    selected: [0, 1, 2],
    output: [
      { text: '✓ child/developer · 8 files changed', tone: 'success' },
      { text: '✓ child/reviewer · no blocking findings', tone: 'success' },
      { text: '→ child/verifier · browser active', tone: 'muted' },
      { text: '✓ shared budget · within ceiling', tone: 'success' },
      { text: 'RUNNING  parent://00108', tone: 'accent' },
    ],
  },
  verify: {
    command: 'orchentra verify --browser',
    output: [
      { text: '✓ typecheck · 0 errors', tone: 'success' },
      { text: '✓ tests · 2212 passed', tone: 'success' },
      { text: '✓ production build · 3 routes exported', tone: 'success' },
      { text: '✓ browser · no console errors', tone: 'success' },
      { text: '✓ responsive · 1440 / 810 / 390', tone: 'success' },
      { text: 'COMPLETE  evidence supports the claim', tone: 'accent' },
    ],
  },
}

export function OrchentraTerminal({
  scenario,
  variant = 'feature',
  className = '',
}: {
  scenario: TerminalScenario
  variant?: 'hero' | 'feature' | 'compact' | 'core'
  className?: string
}): React.ReactNode {
  const config = terminalConfigs[scenario]
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'command' | 'select' | 'complete'>('command')
  const [command, setCommand] = useState(config.command)
  const [cursor, setCursor] = useState(config.selected?.[0] ?? 0)
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set(config.selected ?? []))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [phase])

  const output = useMemo(() => {
    const contextual: TerminalLine[] = []
    if (scenario === 'models' && config.options) {
      contextual.push({ text: `PROFILE  ${config.options[cursor]}`, tone: 'accent' })
    }
    if (scenario === 'outcome' && config.options) {
      contextual.push({ text: `OUTCOME  ${config.options[cursor]}`, tone: 'accent' })
    }
    if ((scenario === 'run' || scenario === 'build') && config.options) {
      const roles = config.options.filter((_, index) => selected.has(index))
      contextual.push({ text: `CREW  ${roles.join(' · ')}`, tone: 'accent' })
    }
    return [...contextual, ...config.output]
  }, [config.options, config.output, cursor, scenario, selected])

  function reset(): void {
    setPhase('command')
    setCommand(config.command)
    setCursor(config.selected?.[0] ?? 0)
    setSelected(new Set(config.selected ?? []))
  }

  function runCommand(): void {
    if (phase === 'command') {
      setPhase(config.options ? 'select' : 'complete')
      return
    }
    if (phase === 'select') setPhase('complete')
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      reset()
      return
    }
    if (phase === 'complete' && event.key.toLowerCase() === 'r') {
      event.preventDefault()
      reset()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      runCommand()
      return
    }
    if (phase !== 'select' || !config.options) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setCursor((value) => (value + direction + config.options!.length) % config.options!.length)
      return
    }
    if (event.key === ' ') {
      event.preventDefault()
      if (config.selection === 'single') {
        setSelected(new Set([cursor]))
      } else {
        setSelected((value) => {
          const next = new Set(value)
          if (next.has(cursor)) next.delete(cursor)
          else next.add(cursor)
          return next
        })
      }
    }
  }

  return (
    <div
      className={`orch-terminal orch-terminal--${variant} ${focused ? 'is-focused' : ''} ${className}`.trim()}
      data-phase={phase}
      onClick={() => inputRef.current?.focus()}
      role="group"
      aria-label={`Interactive Orchentra terminal: ${scenario}`}
    >
      <div className="orch-terminal-bar" aria-hidden="true">
        <span className="terminal-lights">
          <i />
          <i />
          <i />
        </span>
        <span className="terminal-location">
          <TerminalGlyph /> ~
        </span>
      </div>

      <div className="orch-terminal-scroll" ref={scrollRef} aria-live="polite">
        {phase === 'command' ? (
          <>
            <div className="terminal-muted">Last login: Sun Jul 19 23:18:04 on orchentra</div>
            <div className="terminal-command">
              <b>&gt;</b>
              <span>
                {command}
                <i className="terminal-cursor" aria-hidden="true" />
              </span>
            </div>
          </>
        ) : null}

        {phase === 'select' && config.options ? (
          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <strong className="terminal-screen-title">{config.screenTitle}</strong>
            <div className="terminal-muted">{config.screenBody}</div>
            <div className="terminal-options">
              {config.options.map((option, index) => (
                <div className={cursor === index ? 'is-current' : ''} key={option}>
                  <b>{cursor === index ? '>' : ' '}</b>
                  <span>[{selected.has(index) ? (config.selection === 'single' ? '●' : 'x') : ' '}]</span>
                  <strong>{option}</strong>
                </div>
              ))}
            </div>
          </m.div>
        ) : null}

        {phase === 'complete' ? (
          <div className="terminal-output">
            <div className="terminal-muted">$ {command}</div>
            {output.map((line, index) => (
              <m.div
                className={`terminal-line terminal-line--${line.tone ?? 'plain'}`}
                key={line.text}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.09, duration: 0.2 }}
              >
                {line.text}
              </m.div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="orch-terminal-hint" aria-hidden="true">
        {phase === 'command' ? <span>⏎ run command</span> : null}
        {phase === 'select' ? <span>↑↓ move · space toggle · ⏎ confirm · esc reset</span> : null}
        {phase === 'complete' ? <span>r rerun · esc reset</span> : null}
      </div>
      <input
        ref={inputRef}
        className="orch-terminal-input"
        value={command}
        onChange={(event) => {
          if (phase === 'command') setCommand(event.target.value)
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Terminal command input. Press Enter to run."
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  )
}

function TerminalGlyph(): React.ReactNode {
  return (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="10" height="8" rx="1.5" stroke="currentColor" opacity="0.6" />
      <path d="M2.5 3 4 4.5 2.5 6M5.5 6H8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

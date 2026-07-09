import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Box, useApp, useInput, useStdin, useStdout } from 'ink'
import { randomUUID } from 'node:crypto'
import type { AskUserRequest, PermissionMode, RuntimeEvent } from '@orchentra/cli-core'
import type { LiveCli } from '../live-cli'
import type { CommandRegistry } from '../commands/builtin'
import { initialState, reducer } from './reducer'
import { handleRuntimeEvent } from './app/runtime-events'
import { executeSlashCommand } from './app/slash-command-executor'
import { ActiveFlowHost } from './app/ActiveFlowHost'
import { pickVerb } from './components/loading-verbs'
import { computeSuggestions } from './suggestions'
import { expandPastes } from './paste'
import { appendHistory, loadHistory } from './hooks/useHistory'
import { useChord } from './hooks/use-chord'
import { openInEditor } from './external-editor'
import { handleMainInput } from './input/key-handler'
import { buildKeybindings } from './keybindings/registry'
import { loadUserBindings } from './keybindings/load-user-bindings'
import { InputBox } from './components/InputBox'
import { InputModal } from './components/InputModal'
import { HistorySearchPrompt } from './components/HistorySearchPrompt'
import { QueuedMessages } from './components/QueuedMessages'
import { countWrappedLines } from './use-line-count'
import { Suggestions } from './components/Suggestions'
import { Footer } from './status/Footer'
import { Transcript } from './components/Transcript'
import { ActiveCard } from './components/ActiveCard'
import { buildToolDiffPreview } from './components/tool-diff-preview'
import { getStatuslineConfig, isWorkspaceTrusted } from '../session-config'
import type { BannerOptions } from '../render/banner'

export interface TuiProps {
  readonly cli: LiveCli
  readonly registry: CommandRegistry
  readonly cwd: string
  readonly model: string
  readonly mode: PermissionMode
  readonly branch?: string
  readonly banner?: BannerOptions
  readonly clearScreen?: () => void
  readonly resizeGeneration?: number
}

export function Tui(props: TuiProps): React.ReactElement {
  const { cli, registry, clearScreen } = props
  const { exit } = useApp()
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80
  const [cwd, setCwd] = useState(props.cwd)
  const [statuslineConfig, setStatuslineConfigState] = useState(() => getStatuslineConfig())

  const [state, dispatch] = useReducer(
    reducer,
    initialState({
      model: props.model,
      mode: props.mode,
      terseMode: cli.getTerseMode(),
    }),
  )

  // Keep a ref to current state for handlers that need fresh values without
  // re-binding `useInput` on every keystroke.
  const stateRef = useRef(state)
  stateRef.current = state

  const shellHistoryRef = useRef<string[]>([])

  // Build the keybinding registry once from defaults + the user's
  // keybindings.json. Warnings (bad combos, reserved conflicts) surface as
  // system notices on mount so a broken config is visible, not silent.
  const userBindings = useMemo(() => loadUserBindings(), [])
  const keybindings = useMemo(() => buildKeybindings(userBindings.overrides), [userBindings])

  // Buffer ≥ 5 wrapped rows swaps the inline input for a modal overlay.
  // Esc collapses the modal back to inline while preserving the buffer;
  // the flag resets whenever the buffer shrinks under the threshold so a
  // subsequent expansion re-opens the modal cleanly.
  const MULTILINE_THRESHOLD = 5
  const wrappedLines = countWrappedLines(state.buffer, cols)
  const [modalCollapsed, setModalCollapsed] = useState(false)
  useEffect(() => {
    if (wrappedLines < MULTILINE_THRESHOLD && modalCollapsed) setModalCollapsed(false)
  }, [wrappedLines, modalCollapsed])
  const isMultilineModal = wrappedLines >= MULTILINE_THRESHOLD && !modalCollapsed

  const wireEvents = useCallback(() => {
    const sink = (event: RuntimeEvent): void => {
      handleRuntimeEvent(event, dispatch, { streamingIdRef, reasoningIdRef, toolCallNamesRef })
    }
    cli.setEventSink(sink)
    return () => cli.setEventSink(null)
  }, [cli])

  const streamingIdRef = useRef<string | null>(null)
  const reasoningIdRef = useRef<string | null>(null)
  const toolCallNamesRef = useRef<Map<string, string>>(new Map())

  // Mount/unmount: load history, wire event sink, hide terminal cursor.
  useEffect(() => {
    let mounted = true
    loadHistory().then((entries) => {
      if (mounted) dispatch({ type: 'history/load', entries })
    })
    const unwire = wireEvents()
    for (const notice of cli.consumeStartupNotices()) {
      dispatch({
        type: 'transcript/push',
        row: { kind: 'system', id: randomUUID(), text: notice, tone: 'warn' },
      })
    }
    for (const warning of [...userBindings.warnings, ...keybindings.warnings]) {
      dispatch({
        type: 'transcript/push',
        row: { kind: 'system', id: randomUUID(), text: `keybindings: ${warning}`, tone: 'warn' },
      })
    }
    cli.setAskUser(
      (request) =>
        new Promise((resolve) => {
          dispatch({
            type: 'flow/start',
            flow: {
              kind: 'ask-user-prompt',
              request: normalizeAskUserRequest(request),
              rawText: typeof request === 'string',
              resolve,
            },
          })
        }),
    )
    cli.setAskToolUser(
      (request) =>
        new Promise((resolve) => {
          dispatch({
            type: 'flow/start',
            flow: {
              kind: 'confirmation-prompt',
              request: {
                toolLabel: `${request.toolName} call`,
                commandLine: request.inputJson,
                diff: buildToolDiffPreview(request.toolName, request.inputJson) ?? undefined,
                allowPattern: request.suggestedPattern,
              },
              resolve,
            },
          })
        }),
    )
    cli.setNotifyDeny(
      (info) =>
        new Promise((resolve) => {
          dispatch({
            type: 'flow/start',
            flow: {
              kind: 'confirmation-prompt',
              request: {
                toolLabel: `${info.toolName} call`,
                commandLine: info.inputJson,
                allowPattern: '',
                denyBanner: info.reason,
              },
              resolve: () => resolve(),
            },
          })
        }),
    )
    process.stdout.write('[?25l')
    return () => {
      mounted = false
      unwire()
      cli.setAskUser(null)
      cli.setAskToolUser(null)
      cli.setNotifyDeny(null)
      cli.setNotifyPolicy(null)
      process.stdout.write('[?25h')
    }
  }, [wireEvents, cli])

  // First entry into an untrusted directory: gate all input behind a one-time
  // trust prompt before any prompt can be submitted (and thus any tool run).
  useEffect(() => {
    if (!isWorkspaceTrusted(props.cwd)) {
      dispatch({ type: 'flow/start', flow: { kind: 'trust-gate', cwd: props.cwd } })
    }
    // Runs once on mount; the gate only applies to the directory the CLI opened in.
  }, [])

  // Spinner & elapsed timer ticker.
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  useEffect(() => {
    if (state.turn.state === 'idle') return
    const startedAt = state.turn.startedAt ?? Date.now()
    const id = setInterval(() => {
      setSpinnerFrame((f) => f + 1)
      dispatch({ type: 'turn/tick', elapsedMs: Date.now() - startedAt })
    }, 100)
    return () => clearInterval(id)
  }, [state.turn.state, state.turn.startedAt])

  // Rotate the loading verb every ~8s while a turn runs so long reasoning
  // loops feel alive instead of stuck on a single word.
  useEffect(() => {
    if (state.turn.state !== 'running') return
    const id = setInterval(() => {
      dispatch({ type: 'verb/rotate', verb: pickVerb() })
    }, 8000)
    return () => clearInterval(id)
  }, [state.turn.state])

  // Exit hint auto-clear.
  useEffect(() => {
    if (state.exitHintUntil === null) return
    const remaining = state.exitHintUntil - Date.now()
    if (remaining <= 0) {
      dispatch({ type: 'exit-hint/clear' })
      return
    }
    const id = setTimeout(() => dispatch({ type: 'exit-hint/clear' }), remaining)
    return () => clearTimeout(id)
  }, [state.exitHintUntil])

  // Reflect mode changes back into the CLI session.
  useEffect(() => {
    cli.setPermissionMode(state.mode)
  }, [cli, state.mode])

  // Recompute suggestions after every buffer change.
  const suggestionsTokenRef = useRef(0)
  useEffect(() => {
    const token = ++suggestionsTokenRef.current
    const ctx = { registry, cwd, shellHistory: shellHistoryRef.current }
    computeSuggestions(state.buffer, state.cursor, ctx).then((next) => {
      if (token !== suggestionsTokenRef.current) return
      if (next === null) {
        if (state.suggestions.open) dispatch({ type: 'suggestions/close' })
        return
      }
      dispatch({ type: 'suggestions/set', state: next })
    })
  }, [state.buffer, state.cursor, registry, cwd, state.suggestions.open])

  const submitTurn = useCallback(
    async (rawInput: string): Promise<void> => {
      const text = expandPastes(rawInput, stateRef.current.pastes)
      if (text.trim().length === 0) return

      // Push the visible (chip-rendered) form into the transcript so the user
      // sees what they actually typed, not the expanded blob.
      dispatch({
        type: 'transcript/push',
        row: { kind: 'user', id: randomUUID(), text: rawInput },
      })
      dispatch({ type: 'history/append', text: rawInput })
      void appendHistory(rawInput)
      dispatch({ type: 'buffer/set', buffer: '', cursor: 0 })
      dispatch({ type: 'suggestions/close' })

      // Slash commands take a different path: dispatched via the registry
      // rather than the LLM runtime.
      const trimmed = text.trim()
      if (trimmed.startsWith('/')) {
        const handled = await executeSlashCommand({
          input: trimmed,
          registry,
          cli,
          cwd,
          dispatch,
          getState: () => stateRef.current,
          setCwd,
          clearScreen,
          exit,
          streamingIdRef,
        })
        if (handled) return
      }

      // Shell shortcut.
      if (trimmed.startsWith('!')) {
        const cmd = trimmed.slice(1).trim()
        if (cmd.length > 0) {
          shellHistoryRef.current = [cmd, ...shellHistoryRef.current.filter((c) => c !== cmd)].slice(0, 50)
          dispatch({
            type: 'transcript/push',
            row: { kind: 'system', id: randomUUID(), text: `(shell) ${cmd}`, tone: 'info' },
          })
        }
        return
      }

      streamingIdRef.current = null
      dispatch({ type: 'turn/start' })
      try {
        await cli.runTurn(text)
      } finally {
        streamingIdRef.current = null
        dispatch({ type: 'transcript/stream-end' })
        dispatch({ type: 'turn/end' })
      }
    },
    [cli, cwd, registry, exit, clearScreen],
  )

  // Drain the type-ahead queue: once the runtime goes idle, submit the oldest
  // queued message. `submitTurn` starts the next turn (or resolves quickly for
  // slash/empty input), and the effect re-fires on the resulting idle to drain
  // the rest, one at a time, in order. The ref guards against a second submit
  // slipping in before `turn/start` lands.
  const drainingRef = useRef(false)
  useEffect(() => {
    if (state.turn.state !== 'idle' || state.queued.length === 0 || drainingRef.current) return
    drainingRef.current = true
    const next = state.queued[0]
    dispatch({ type: 'queue/shift' })
    void submitTurn(next).finally(() => {
      drainingRef.current = false
    })
  }, [state.turn.state, state.queued, submitTurn])

  // Ctrl+x ctrl+e — open the current buffer in $EDITOR. The chord state
  // lives outside `useInput` because the action half spawns a blocking
  // subprocess and we need access to Ink's setRawMode + the latest buffer.
  const { setRawMode } = useStdin()
  const openExternalEditor = useCallback(() => {
    const initial = stateRef.current.buffer
    // Hand the terminal back to the editor: stop reading raw keys, drop the
    // hidden-cursor mode we set on mount, then restore both after exit.
    try {
      setRawMode(false)
    } catch {
      /* setRawMode may throw in non-TTY envs; safe to ignore */
    }
    process.stdout.write('[?25h')
    void openInEditor(initial)
      .then((next) => {
        if (next === null) return // editor exited non-zero — keep original buffer
        dispatch({ type: 'buffer/set', buffer: next, cursor: next.length })
      })
      .finally(() => {
        process.stdout.write('[?25l')
        try {
          setRawMode(true)
        } catch {
          /* see above */
        }
      })
  }, [setRawMode])

  const chordEditor = useChord(
    (input, key) => key.ctrl && input === 'x',
    (input, key) => key.ctrl && input === 'e',
    1500,
    openExternalEditor,
  )

  // Keyboard handler — single useInput owns all keys so we can branch on
  // suggestion-open / turn-running state cleanly. Disabled while an
  // interactive flow (e.g. Anthropic login overlay) owns input.
  useInput(
    (input, key) => {
      handleMainInput({
        input,
        key,
        state: stateRef.current,
        dispatch,
        cli,
        exit,
        chordEditor,
        submitTurn,
        isMultilineModal,
        collapseMultilineModal: () => setModalCollapsed(true),
        keybindings,
      })
    },
    { isActive: state.activeFlow === null },
  )

  const showSuggestions = state.suggestions.open && state.turn.state === 'idle' && state.historySearch === null
  // Input stays live while a turn runs so the user can type ahead; queued
  // messages drain in order once idle (see the drain effect above).
  const inputDisabled = false
  const suggestionsWidth = useMemo(() => Math.max(40, Math.min(cols - 2, 100)), [cols])

  return (
    <Box flexDirection="column">
      <Transcript
        rows={state.transcript}
        streamingRowId={state.streamingRowId}
        generation={`${state.screenGeneration}:${props.resizeGeneration ?? 0}`}
        banner={props.banner}
      />
      <Box flexDirection="column">
        <ActiveFlowHost
          flow={state.activeFlow}
          cli={cli}
          registry={registry}
          dispatch={dispatch}
          getState={() => stateRef.current}
          exit={exit}
          statuslineConfig={statuslineConfig}
          setStatuslineConfig={setStatuslineConfigState}
        />
        {state.activeCard ? <ActiveCard card={state.activeCard} /> : null}
        <QueuedMessages queued={state.queued} />
        {state.historySearch ? (
          <HistorySearchPrompt search={state.historySearch} history={state.history} />
        ) : isMultilineModal ? (
          <InputModal
            buffer={state.buffer}
            cursor={state.cursor}
            pastes={state.pastes}
            placeholder="Type a message, /command, @file, or !shell"
            disabled={inputDisabled}
          />
        ) : (
          <InputBox
            buffer={state.buffer}
            cursor={state.cursor}
            pastes={state.pastes}
            placeholder="Type a message, /command, @file, or !shell"
            disabled={inputDisabled}
          />
        )}
        {showSuggestions ? <Suggestions state={state.suggestions} width={suggestionsWidth} /> : null}
        <Footer
          model={state.model}
          mode={state.mode}
          terseMode={state.terseMode}
          effort={cli.getEffort?.()}
          cwd={cwd}
          branch={props.branch}
          sessionId={cli.getSessionId()}
          turn={state.turn}
          spinnerFrame={spinnerFrame}
          exitHintActive={state.exitHintUntil !== null}
          exitHintKey={state.exitHintKey ?? undefined}
          contextStats={cli.getContextStats?.()}
          tasks={cli.listTaskSummaries?.()}
          statusline={statuslineConfig}
        />
      </Box>
    </Box>
  )
}

function normalizeAskUserRequest(request: string | AskUserRequest): AskUserRequest {
  if (typeof request === 'string') return { question: request }
  return request
}

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Box, useApp, useInput, useStdout } from 'ink'
import { randomUUID } from 'node:crypto'
import type { PermissionMode, RuntimeEvent } from '@orchentra/cli-core'
import type { LiveCli } from '../live-cli'
import type { CommandRegistry } from '../commands/builtin'
import type { CommandContext } from '../commands/builtin'
import { initialState, reducer } from './reducer'
import { pickVerb } from './components/loading-verbs'
import { computeSuggestions } from './suggestions'
import { evaluatePaste, expandPastes } from './paste'
import { deleteWordBack, wordBoundaryLeft, wordBoundaryRight } from './word-boundary'
import { appendHistory, loadHistory } from './hooks/useHistory'
import { InputBox } from './components/InputBox'
import { Suggestions } from './components/Suggestions'
import { Footer } from './components/Footer'
import { Transcript } from './components/Transcript'
import { ActiveCard } from './components/ActiveCard'
import { AnthropicLoginCard } from './components/AnthropicLoginCard'
import { ConfirmationPrompt } from './components/ConfirmationPrompt'
import { ModelPickerCard } from './components/ModelPickerCard'
import type { BannerOptions } from '../render/banner'
import type { TuiAction, TuiState } from './types'

export interface TuiProps {
  readonly cli: LiveCli
  readonly registry: CommandRegistry
  readonly cwd: string
  readonly model: string
  readonly mode: PermissionMode
  readonly branch?: string
  readonly banner?: BannerOptions
}

export function Tui(props: TuiProps): React.ReactElement {
  const { cli, registry, cwd } = props
  const { exit } = useApp()
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80

  const [state, dispatch] = useReducer(
    reducer,
    initialState({
      model: props.model,
      mode: props.mode,
    }),
  )

  // Keep a ref to current state for handlers that need fresh values without
  // re-binding `useInput` on every keystroke.
  const stateRef = useRef(state)
  stateRef.current = state

  const shellHistoryRef = useRef<string[]>([])

  const wireEvents = useCallback(() => {
    const sink = (event: RuntimeEvent): void => {
      handleRuntimeEvent(event, dispatch, streamingIdRef, reasoningIdRef, toolCallNamesRef)
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
    cli.setAskUser(async () => '')
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
        const resolved = registry.resolve(trimmed)
        if (resolved instanceof Error) {
          dispatch({
            type: 'transcript/push',
            row: { kind: 'error', id: randomUUID(), message: resolved.message },
          })
          return
        }
        if (resolved !== null) {
          let usedUiSink = false
          let activeStreamId: string | null = null
          const ui = (output: import('../commands/ui-output').UiOutput): void => {
            usedUiSink = true
            switch (output.kind) {
              case 'text':
                dispatch({
                  type: 'transcript/push',
                  row: { kind: 'system', id: randomUUID(), text: output.text, tone: 'info' },
                })
                return
              case 'note':
                dispatch({
                  type: 'transcript/push',
                  row: { kind: 'system', id: randomUUID(), text: output.text, tone: output.tone ?? 'info' },
                })
                return
              case 'card':
                if (output.sectionsByTab && output.tabs) {
                  dispatch({
                    type: 'card/open',
                    card: {
                      id: randomUUID(),
                      title: output.title,
                      subtitle: output.subtitle,
                      tabs: output.tabs,
                      activeTab: output.tabs.active,
                      sectionsByTab: output.sectionsByTab,
                    },
                  })
                } else {
                  dispatch({
                    type: 'transcript/push',
                    row: {
                      kind: 'card',
                      id: randomUUID(),
                      title: output.title,
                      subtitle: output.subtitle,
                      tabs: output.tabs,
                      sections: output.sections,
                    },
                  })
                }
                return
              case 'stream':
                if (activeStreamId === null) {
                  activeStreamId = randomUUID()
                  dispatch({
                    type: 'transcript/system-stream-begin',
                    rowId: activeStreamId,
                    label: output.label,
                  })
                }
                dispatch({
                  type: 'transcript/system-stream-append',
                  rowId: activeStreamId,
                  delta: output.delta,
                })
                return
              case 'login-flow':
                if (output.provider === 'anthropic') {
                  dispatch({ type: 'flow/start', flow: { kind: 'anthropic-login' } })
                }
                return
              case 'model-picker':
                dispatch({ type: 'flow/start', flow: { kind: 'model-picker', current: output.current } })
                return
            }
          }
          const ctx: CommandContext = { cwd, session: cli, ui }
          const captured = captureStdio()
          try {
            const shouldContinue = await resolved.handler.execute(resolved.args, ctx)
            const output = captured.stop().trimEnd()
            if (output.length > 0 && !usedUiSink) {
              dispatch({
                type: 'transcript/push',
                row: { kind: 'system', id: randomUUID(), text: output, tone: 'info' },
              })
            }
            if (activeStreamId !== null) dispatch({ type: 'transcript/system-stream-end' })
            if (!shouldContinue) exit()
          } catch (err) {
            const output = captured.stop().trimEnd()
            if (output.length > 0 && !usedUiSink) {
              dispatch({
                type: 'transcript/push',
                row: { kind: 'system', id: randomUUID(), text: output, tone: 'info' },
              })
            }
            if (activeStreamId !== null) dispatch({ type: 'transcript/system-stream-end' })
            dispatch({
              type: 'transcript/push',
              row: {
                kind: 'error',
                id: randomUUID(),
                message: err instanceof Error ? err.message : String(err),
              },
            })
          }
          return
        }
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

      // Free-form text is not a chat surface. Orchentra is a slash-command
      // DevOps tool; general AI chat lives in Claude Code or Cursor. Print a
      // hint that names the closest slash command instead of forwarding to
      // the LLM. Composite handlers like /triage and /scan still invoke the
      // LLM internally — they are reachable as named commands, not from
      // free-form text.
      dispatch({
        type: 'transcript/push',
        row: {
          kind: 'system',
          id: randomUUID(),
          text:
            'orchentra is a slash-command DevOps CLI — free-form text does not run an AI turn.\n' +
            'Type /help to list commands, /help <op> for parameter detail.\n' +
            'For general AI chat, use Claude Code or Cursor.',
          tone: 'info',
        },
      })
    },
    [cli, cwd, registry, exit],
  )

  // Keyboard handler — single useInput owns all keys so we can branch on
  // suggestion-open / turn-running state cleanly. Disabled while an
  // interactive flow (e.g. Anthropic login overlay) owns input.
  useInput(
    (input, key) => {
      const cur = stateRef.current

      // While a turn is running, only Esc/Ctrl+C can do anything useful.
      if (cur.turn.state !== 'idle') {
        if (key.ctrl && input === 'c') {
          if (cur.turn.state === 'running') {
            dispatch({ type: 'turn/cancelling' })
            cli.abort()
          }
          return
        }
        if (key.escape) {
          if (cur.turn.state === 'running') {
            dispatch({ type: 'turn/cancelling' })
            cli.abort()
          }
          return
        }
        return
      }

      if (key.shift && key.tab) {
        dispatch({ type: 'mode/cycle' })
        return
      }

      // Active card hijacks navigation keys while focused.
      if (cur.activeCard) {
        const tabsLen = cur.activeCard.tabs?.items.length ?? 0
        if (tabsLen > 0 && key.leftArrow) return dispatch({ type: 'card/set-tab', index: cur.activeCard.activeTab - 1 })
        if (tabsLen > 0 && key.rightArrow)
          return dispatch({ type: 'card/set-tab', index: cur.activeCard.activeTab + 1 })
        if (tabsLen > 0 && key.tab) return dispatch({ type: 'card/set-tab', index: cur.activeCard.activeTab + 1 })
        if (key.downArrow || key.escape) return dispatch({ type: 'card/dismiss' })
        // Anything else falls through to normal handling.
      }

      if (cur.suggestions.open) {
        if (key.upArrow) return dispatch({ type: 'suggestions/move', delta: -1 })
        if (key.downArrow) return dispatch({ type: 'suggestions/move', delta: 1 })
        if (key.escape) return dispatch({ type: 'suggestions/close' })
        if (key.tab || key.return) {
          const item = cur.suggestions.items[cur.suggestions.selected]
          if (item) {
            const before = cur.buffer.slice(0, cur.suggestions.anchorStart)
            const after = cur.buffer.slice(cur.cursor)
            const insert = `${item.value} `
            const next = `${before}${insert}${after}`
            dispatch({ type: 'buffer/set', buffer: next, cursor: before.length + insert.length })
            dispatch({ type: 'suggestions/close' })
          }
          return
        }
      }

      if (key.ctrl && input === 'c') {
        if (cur.buffer.length > 0) {
          dispatch({ type: 'buffer/set', buffer: '', cursor: 0 })
          dispatch({ type: 'exit-hint/clear' })
          return
        }
        if (cur.exitHintUntil !== null) {
          exit()
          return
        }
        dispatch({ type: 'exit-hint/show', until: Date.now() + 1500 })
        return
      }

      if (key.ctrl && input === 'd') {
        if (cur.buffer.length === 0) {
          exit()
          return
        }
        // forward-delete
        if (cur.cursor < cur.buffer.length) {
          const next = cur.buffer.slice(0, cur.cursor) + cur.buffer.slice(cur.cursor + 1)
          dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor })
        }
        return
      }

      if (key.ctrl && input === 'l') {
        return dispatch({ type: 'transcript/clear' })
      }

      if (key.ctrl && input === 'r') {
        return dispatch({ type: 'reasoning/toggle-last' })
      }

      if (key.ctrl && input === 'o') {
        return dispatch({ type: 'collapsible/toggle-last' })
      }

      if (input === '?' && cur.buffer.length === 0 && !cur.suggestions.open && !cur.activeCard) {
        dispatch({
          type: 'card/open',
          card: {
            id: randomUUID(),
            title: 'Keyboard shortcuts',
            subtitle: 'Press ↓ or Esc to dismiss',
            activeTab: 0,
            sectionsByTab: [SHORTCUT_SECTIONS],
          },
        })
        return
      }

      if (key.ctrl && input === 'u') {
        const next = cur.buffer.slice(cur.cursor)
        return dispatch({ type: 'buffer/set', buffer: next, cursor: 0 })
      }

      if (key.ctrl && input === 'k') {
        const next = cur.buffer.slice(0, cur.cursor)
        return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor })
      }

      if (key.ctrl && input === 'w') {
        const trimmed = deleteWordBack(cur.buffer, cur.cursor)
        return dispatch({ type: 'buffer/set', buffer: trimmed.buffer, cursor: trimmed.cursor })
      }

      if (key.leftArrow && (key.meta || key.ctrl)) {
        return dispatch({
          type: 'buffer/set',
          buffer: cur.buffer,
          cursor: wordBoundaryLeft(cur.buffer, cur.cursor),
        })
      }
      if (key.rightArrow && (key.meta || key.ctrl)) {
        return dispatch({
          type: 'buffer/set',
          buffer: cur.buffer,
          cursor: wordBoundaryRight(cur.buffer, cur.cursor),
        })
      }

      if (key.upArrow) {
        const onFirstLine = cur.buffer.indexOf('\n') === -1 || cur.cursor <= cur.buffer.indexOf('\n')
        if (onFirstLine) return dispatch({ type: 'history/prev' })
        return moveLine(cur, -1, dispatch)
      }
      if (key.downArrow) {
        const lastNl = cur.buffer.lastIndexOf('\n')
        const onLastLine = lastNl === -1 || cur.cursor > lastNl
        if (onLastLine) return dispatch({ type: 'history/next' })
        return moveLine(cur, 1, dispatch)
      }
      if (key.leftArrow) {
        return dispatch({ type: 'buffer/set', buffer: cur.buffer, cursor: Math.max(0, cur.cursor - 1) })
      }
      if (key.rightArrow) {
        return dispatch({
          type: 'buffer/set',
          buffer: cur.buffer,
          cursor: Math.min(cur.buffer.length, cur.cursor + 1),
        })
      }

      if (key.return) {
        if (key.shift || endsWithBackslashLine(cur.buffer, cur.cursor)) {
          // Insert newline; if backslash-EOL, replace the backslash with newline.
          if (endsWithBackslashLine(cur.buffer, cur.cursor)) {
            const next = cur.buffer.slice(0, cur.cursor - 1) + '\n' + cur.buffer.slice(cur.cursor)
            return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor })
          }
          const next = cur.buffer.slice(0, cur.cursor) + '\n' + cur.buffer.slice(cur.cursor)
          return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor + 1 })
        }
        if (hasUnclosedFence(cur.buffer)) {
          const next = cur.buffer.slice(0, cur.cursor) + '\n' + cur.buffer.slice(cur.cursor)
          return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor + 1 })
        }
        void submitTurn(cur.buffer)
        return
      }

      if (key.tab) {
        const next = cur.buffer.slice(0, cur.cursor) + '  ' + cur.buffer.slice(cur.cursor)
        return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor + 2 })
      }

      if (key.backspace || key.delete) {
        if (cur.cursor === 0) return
        const next = cur.buffer.slice(0, cur.cursor - 1) + cur.buffer.slice(cur.cursor)
        return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor - 1 })
      }

      if (key.escape) {
        if (cur.buffer.length > 0) {
          return dispatch({ type: 'buffer/set', buffer: '', cursor: 0 })
        }
        return
      }

      if (input && input.length > 0 && !key.ctrl && !key.meta) {
        // Paste detection: large multi-line input arriving in one keystroke.
        const paste = evaluatePaste(input)
        if (paste) {
          dispatch({
            type: 'paste/add',
            chip: { id: paste.chipId, content: paste.content, lines: paste.lines },
          })
          const insert = paste.chipMarker
          const next = cur.buffer.slice(0, cur.cursor) + insert + cur.buffer.slice(cur.cursor)
          return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor + insert.length })
        }
        const next = cur.buffer.slice(0, cur.cursor) + input + cur.buffer.slice(cur.cursor)
        return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor + input.length })
      }
    },
    { isActive: state.activeFlow === null },
  )

  const showSuggestions = state.suggestions.open && state.turn.state === 'idle'
  const inputDisabled = state.turn.state !== 'idle'
  const suggestionsWidth = useMemo(() => Math.max(40, Math.min(cols - 2, 100)), [cols])

  return (
    <Box flexDirection="column">
      <Transcript rows={state.transcript} streamingRowId={state.streamingRowId} banner={props.banner} />
      <Box flexDirection="column">
        {state.activeFlow?.kind === 'anthropic-login' ? (
          <AnthropicLoginCard
            onComplete={(result) => {
              dispatch({ type: 'flow/end' })
              dispatch({
                type: 'transcript/push',
                row: result.ok
                  ? { kind: 'system', id: randomUUID(), text: `✓ ${result.message}`, tone: 'info' }
                  : { kind: 'error', id: randomUUID(), message: `Anthropic login: ${result.message}` },
              })
            }}
          />
        ) : null}
        {state.activeFlow?.kind === 'confirmation-prompt' ? (
          <ConfirmationPrompt
            request={state.activeFlow.request}
            onChoose={(choice) => {
              const flow = state.activeFlow
              dispatch({ type: 'flow/end' })
              if (flow?.kind === 'confirmation-prompt') flow.resolve(choice)
            }}
            onExplain={() => {
              const flow = state.activeFlow
              if (flow?.kind !== 'confirmation-prompt') return
              const explainPrompt = `Explain this command before I run it: ${flow.request.commandLine}`
              dispatch({ type: 'flow/end' })
              flow.resolve('cancel')
              dispatch({ type: 'buffer/set', buffer: explainPrompt, cursor: explainPrompt.length })
            }}
          />
        ) : null}
        {state.activeFlow?.kind === 'model-picker' ? (
          <ModelPickerCard
            current={state.activeFlow.current}
            onPick={(modelId) => {
              const resolved = cli.setModel(modelId)
              dispatch({ type: 'model/set', model: resolved })
              dispatch({ type: 'flow/end' })
              dispatch({
                type: 'transcript/push',
                row: { kind: 'system', id: randomUUID(), text: `✓ model → ${resolved}`, tone: 'info' },
              })
            }}
            onCancel={() => {
              dispatch({ type: 'flow/end' })
            }}
          />
        ) : null}
        {state.activeCard ? <ActiveCard card={state.activeCard} /> : null}
        {showSuggestions ? <Suggestions state={state.suggestions} width={suggestionsWidth} /> : null}
        <InputBox
          buffer={state.buffer}
          cursor={state.cursor}
          pastes={state.pastes}
          placeholder="Type a message, /command, @file, or !shell"
          disabled={inputDisabled}
        />
        <Footer
          model={state.model}
          mode={state.mode}
          cwd={cwd}
          branch={props.branch}
          turn={state.turn}
          spinnerFrame={spinnerFrame}
          exitHintActive={state.exitHintUntil !== null}
        />
      </Box>
    </Box>
  )
}

const SHORTCUT_SECTIONS = [
  {
    title: 'Editing',
    rows: [
      { key: 'enter', value: 'submit' },
      { key: 'shift+enter', value: 'newline' },
      { key: 'ctrl+u', value: 'delete to start of line' },
      { key: 'ctrl+k', value: 'delete to end of line' },
      { key: 'ctrl+w', value: 'delete previous word' },
      { key: 'alt+← / →', value: 'jump cursor to previous / next word' },
      { key: '↑ / ↓', value: 'history (or move cursor in multi-line)' },
    ],
  },
  {
    title: 'Session',
    rows: [
      { key: 'ctrl+l', value: 'clear transcript' },
      { key: 'ctrl+r', value: 'expand / collapse last reasoning block' },
      { key: 'ctrl+o', value: 'expand / collapse last tool result' },
      { key: 'ctrl+e', value: 'explain pending command (in confirmation overlay)' },
      { key: 'shift+tab', value: 'cycle permission mode' },
      { key: 'esc', value: 'cancel running turn / clear buffer' },
      { key: 'ctrl+c', value: 'cancel turn / quit' },
      { key: 'ctrl+d', value: 'forward delete / quit on empty line' },
    ],
  },
  {
    title: 'Discovery',
    rows: [
      { key: '/', value: 'slash command picker' },
      { key: '@', value: 'file path picker' },
      { key: '!', value: 'shell shortcut' },
      { key: '?', value: 'this help (when buffer is empty)' },
    ],
  },
] as const

// ---- handlers / helpers ----

function handleRuntimeEvent(
  event: RuntimeEvent,
  dispatch: React.Dispatch<TuiAction>,
  streamingIdRef: React.MutableRefObject<string | null>,
  reasoningIdRef: React.MutableRefObject<string | null>,
  toolCallNamesRef: React.MutableRefObject<Map<string, string>>,
): void {
  switch (event.kind) {
    case 'text': {
      if (reasoningIdRef.current !== null) {
        dispatch({ type: 'transcript/reasoning-end', rowId: reasoningIdRef.current, endedAt: Date.now() })
        reasoningIdRef.current = null
      }
      let id = streamingIdRef.current
      if (id === null) {
        id = randomUUID()
        streamingIdRef.current = id
        dispatch({ type: 'transcript/stream-begin', rowId: id })
      }
      dispatch({ type: 'transcript/stream-append', rowId: id, delta: event.delta })
      break
    }
    case 'reasoning': {
      let id = reasoningIdRef.current
      if (id === null) {
        id = randomUUID()
        reasoningIdRef.current = id
        dispatch({ type: 'transcript/reasoning-begin', rowId: id, startedAt: Date.now() })
      }
      dispatch({ type: 'transcript/reasoning-append', rowId: id, delta: event.delta })
      break
    }
    case 'tool_use':
      if (reasoningIdRef.current !== null) {
        dispatch({ type: 'transcript/reasoning-end', rowId: reasoningIdRef.current, endedAt: Date.now() })
        reasoningIdRef.current = null
      }
      streamingIdRef.current = null
      dispatch({ type: 'transcript/stream-end' })
      toolCallNamesRef.current.set(event.call.id, event.call.name)
      dispatch({
        type: 'transcript/push',
        row: {
          kind: 'tool_call',
          id: randomUUID(),
          name: event.call.name,
          input: typeof event.call.input === 'string' ? event.call.input : JSON.stringify(event.call.input),
        },
      })
      break
    case 'tool_result': {
      const name = toolCallNamesRef.current.get(event.result.id)
      toolCallNamesRef.current.delete(event.result.id)
      dispatch({
        type: 'transcript/push',
        row: {
          kind: 'tool_result',
          id: randomUUID(),
          name,
          preview: event.result.content,
          isError: event.result.isError,
          expanded: false,
        },
      })
      break
    }
    case 'compacted':
      dispatch({
        type: 'transcript/push',
        row: { kind: 'compacted', id: randomUUID(), dropped: event.droppedMessageCount, saved: event.tokensSaved },
      })
      break
    case 'usage':
      dispatch({ type: 'tokens/set', usage: event.cumulative })
      break
    case 'error':
      if (!event.retryable) {
        dispatch({ type: 'transcript/push', row: { kind: 'error', id: randomUUID(), message: event.message } })
      }
      break
    case 'done':
      if (reasoningIdRef.current !== null) {
        dispatch({ type: 'transcript/reasoning-end', rowId: reasoningIdRef.current, endedAt: Date.now() })
        reasoningIdRef.current = null
      }
      streamingIdRef.current = null
      dispatch({ type: 'transcript/stream-end' })
      break
  }
}

function moveLine(state: TuiState, delta: -1 | 1, dispatch: React.Dispatch<TuiAction>): void {
  const lines = state.buffer.split('\n')
  let lineIdx = 0
  let consumed = 0
  let column = state.cursor
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i].length
    if (state.cursor <= consumed + len) {
      lineIdx = i
      column = state.cursor - consumed
      break
    }
    consumed += len + 1
  }
  const target = lineIdx + delta
  if (target < 0 || target >= lines.length) return
  const targetCol = Math.min(column, lines[target].length)
  let pos = 0
  for (let i = 0; i < target; i++) pos += lines[i].length + 1
  pos += targetCol
  dispatch({ type: 'buffer/set', buffer: state.buffer, cursor: pos })
}

function endsWithBackslashLine(buffer: string, cursor: number): boolean {
  if (cursor === 0) return false
  return buffer[cursor - 1] === '\\'
}

interface StdioCapture {
  stop: () => string
}

/**
 * Temporarily replace `process.stdout.write` and `process.stderr.write` with
 * collectors. Slash commands write to stdout directly; without this, those
 * writes get clobbered by Ink's bottom-panel renderer. Returns a handle whose
 * `stop()` restores the originals and returns the captured text.
 *
 * Note: this is a process-wide patch for the duration of the command. We do
 * not run multiple commands concurrently in the TUI, so that's fine — but
 * don't call this from anywhere that might overlap.
 */
function captureStdio(): StdioCapture {
  const buf: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  const collector = ((chunk: string | Uint8Array): boolean => {
    buf.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
    return true
  }) as typeof process.stdout.write
  process.stdout.write = collector
  process.stderr.write = collector
  return {
    stop: () => {
      process.stdout.write = origOut
      process.stderr.write = origErr
      return buf.join('')
    },
  }
}

function hasUnclosedFence(buffer: string): boolean {
  let count = 0
  for (let i = 0; i < buffer.length - 2; i++) {
    if (buffer[i] === '`' && buffer[i + 1] === '`' && buffer[i + 2] === '`') {
      count += 1
      i += 2
    }
  }
  return count % 2 === 1
}

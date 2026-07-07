import { randomUUID } from 'node:crypto'
import type { Dispatch, MutableRefObject } from 'react'
import type { LiveCli } from '../../live-cli'
import type { CommandContext, CommandRegistry } from '../../commands/builtin'
import type { UiOutput } from '../../commands/ui-output'
import { planNeedFromTranscript } from '../transcript-context'
import { transcriptText } from '../transcript/text'
import { captureStdio } from '../terminal/stdio-capture'
import type { TuiAction, TuiState } from '../types'

export interface SlashCommandExecutorArgs {
  readonly input: string
  readonly registry: CommandRegistry
  readonly cli: LiveCli
  readonly cwd: string
  readonly dispatch: Dispatch<TuiAction>
  readonly getState: () => TuiState
  readonly setCwd: (next: string) => void
  readonly clearScreen?: () => void
  readonly exit: () => void
  readonly streamingIdRef: MutableRefObject<string | null>
}

/**
 * Execute a resolved slash command and translate structured command output
 * into TUI state. Returns `false` only when the slash-looking input was not
 * claimed by the registry and should continue through the normal prompt path.
 */
export async function executeSlashCommand(args: SlashCommandExecutorArgs): Promise<boolean> {
  const resolved = args.registry.resolve(args.input)
  if (resolved instanceof Error) {
    args.dispatch({
      type: 'transcript/push',
      row: { kind: 'error', id: randomUUID(), message: resolved.message },
    })
    return true
  }
  if (resolved === null) return false

  let usedUiSink = false
  let activeStreamId: string | null = null
  const ui = (output: UiOutput): void => {
    usedUiSink = true
    activeStreamId = routeUiOutput(output, args, activeStreamId)
  }

  const ctx: CommandContext = {
    cwd: args.cwd,
    session: args.cli,
    ui,
    setCwd: (next) => {
      args.setCwd(next)
      args.cli.setCwd?.(next)
    },
    getRecentTranscriptContext: () => planNeedFromTranscript(args.getState().transcript),
    getTranscriptText: () => transcriptText(args.getState().transcript),
    runTurn: async (input) => {
      args.streamingIdRef.current = null
      args.dispatch({ type: 'turn/start' })
      try {
        await args.cli.runTurn(input)
      } finally {
        args.streamingIdRef.current = null
        args.dispatch({ type: 'transcript/stream-end' })
        args.dispatch({ type: 'turn/end' })
      }
    },
  }

  const captured = captureStdio()
  try {
    const shouldContinue = await resolved.handler.execute(resolved.args, ctx)
    flushCapturedOutput(captured.stop().trimEnd(), usedUiSink, args.dispatch)
    if (activeStreamId !== null) args.dispatch({ type: 'transcript/system-stream-end' })
    args.dispatch({ type: 'mode/set', mode: args.cli.getPermissionMode() })
    args.dispatch({ type: 'terse/set', mode: args.cli.getTerseMode() })
    if (!shouldContinue) args.exit()
  } catch (err) {
    flushCapturedOutput(captured.stop().trimEnd(), usedUiSink, args.dispatch)
    if (activeStreamId !== null) args.dispatch({ type: 'transcript/system-stream-end' })
    args.dispatch({
      type: 'transcript/push',
      row: {
        kind: 'error',
        id: randomUUID(),
        message: err instanceof Error ? err.message : String(err),
      },
    })
  }

  return true
}

function routeUiOutput(output: UiOutput, args: SlashCommandExecutorArgs, activeStreamId: string | null): string | null {
  switch (output.kind) {
    case 'text':
      args.dispatch({
        type: 'transcript/push',
        row: { kind: 'system', id: randomUUID(), text: output.text, tone: 'info' },
      })
      return activeStreamId
    case 'note':
      args.dispatch({
        type: 'transcript/push',
        row: { kind: 'system', id: randomUUID(), text: output.text, tone: output.tone ?? 'info' },
      })
      return activeStreamId
    case 'clear-session':
      args.clearScreen?.()
      args.dispatch({ type: 'session/clear-visible', note: output.text, noteId: randomUUID() })
      return activeStreamId
    case 'card':
      if (output.sectionsByTab && output.tabs) {
        args.dispatch({
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
        args.dispatch({
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
      return activeStreamId
    case 'stream': {
      let streamId = activeStreamId
      if (streamId === null) {
        streamId = randomUUID()
        args.dispatch({
          type: 'transcript/system-stream-begin',
          rowId: streamId,
          label: output.label,
        })
      }
      args.dispatch({
        type: 'transcript/system-stream-append',
        rowId: streamId,
        delta: output.delta,
      })
      return streamId
    }
    case 'login-flow':
      if (output.provider === 'anthropic') {
        args.dispatch({ type: 'flow/start', flow: { kind: 'anthropic-login' } })
      }
      return activeStreamId
    case 'login-picker':
      args.dispatch({ type: 'flow/start', flow: { kind: 'login-picker' } })
      return activeStreamId
    case 'model-picker':
      args.dispatch({ type: 'flow/start', flow: { kind: 'model-picker', current: output.current } })
      return activeStreamId
    case 'effort-picker':
      args.dispatch({ type: 'flow/start', flow: { kind: 'effort-picker', current: output.current } })
      return activeStreamId
    case 'plan-level-picker':
      args.dispatch({ type: 'flow/start', flow: { kind: 'plan-level-picker', current: output.current } })
      return activeStreamId
    case 'repo-picker':
      args.dispatch({
        type: 'flow/start',
        flow: { kind: 'repo-picker', repos: output.repos, current: output.current },
      })
      return activeStreamId
    case 'theme-picker':
      args.dispatch({ type: 'flow/start', flow: { kind: 'theme-picker' } })
      return activeStreamId
  }
}

function flushCapturedOutput(output: string, usedUiSink: boolean, dispatch: Dispatch<TuiAction>): void {
  if (output.length === 0 || usedUiSink) return
  dispatch({
    type: 'transcript/push',
    row: { kind: 'system', id: randomUUID(), text: output, tone: 'info' },
  })
}

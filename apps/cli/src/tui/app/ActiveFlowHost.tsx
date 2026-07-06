import { randomUUID } from 'node:crypto'
import React from 'react'
import type { Dispatch } from 'react'
import type { LiveCli } from '../../live-cli'
import type { CommandRegistry } from '../../commands/builtin'
import { setActiveRepo, setDefaultModel } from '../../session-config'
import { AnthropicLoginCard } from '../components/AnthropicLoginCard'
import { CommandPalette } from '../components/CommandPalette'
import { ConfirmationPrompt } from '../components/ConfirmationPrompt'
import { EffortSlider } from '../components/EffortSlider'
import { LoginPickerCard } from '../components/LoginPickerCard'
import { ModelPickerCard } from '../components/ModelPickerCard'
import { PlanLevelSlider } from '../components/PlanLevelSlider'
import { RepoPickerCard } from '../components/RepoPickerCard'
import { ThemePicker } from '../components/ThemePicker'
import { loadActiveTheme, saveActiveTheme } from '../theme-registry'
import type { ActiveFlowState, TuiAction, TuiState } from '../types'

export interface ActiveFlowHostProps {
  readonly flow: ActiveFlowState | null
  readonly cli: LiveCli
  readonly registry: CommandRegistry
  readonly dispatch: Dispatch<TuiAction>
  readonly getState: () => TuiState
}

/**
 * Interactive overlays that temporarily own keyboard input. Keeping them in
 * one host mirrors the TUI's mental model: the app shell renders transcript,
 * prompt, footer; this host renders whichever modal-like flow is active.
 */
export function ActiveFlowHost(props: ActiveFlowHostProps): React.ReactElement | null {
  const { flow, cli, dispatch } = props
  if (flow === null) return null

  switch (flow.kind) {
    case 'anthropic-login':
      return (
        <AnthropicLoginCard
          onComplete={(result) => {
            dispatch({ type: 'flow/end' })
            dispatch({
              type: 'transcript/push',
              row: result.ok
                ? { kind: 'system', id: randomUUID(), text: `${okGlyph()} ${result.message}`, tone: 'info' }
                : { kind: 'error', id: randomUUID(), message: `Anthropic login: ${result.message}` },
            })
          }}
        />
      )
    case 'login-picker':
      return (
        <LoginPickerCard
          onComplete={(result) => {
            dispatch({ type: 'flow/end' })
            if (result.message === 'cancelled') return
            dispatch({
              type: 'transcript/push',
              row: result.ok
                ? { kind: 'system', id: randomUUID(), text: `${okGlyph()} ${result.message}`, tone: 'info' }
                : { kind: 'system', id: randomUUID(), text: result.message, tone: 'info' },
            })
          }}
        />
      )
    case 'confirmation-prompt':
      return (
        <ConfirmationPrompt
          request={flow.request}
          onChoose={(choice) => {
            dispatch({ type: 'flow/end' })
            flow.resolve(choice)
          }}
          onExplain={() => {
            const explainPrompt = `Explain this command before I run it: ${flow.request.commandLine}`
            dispatch({ type: 'flow/end' })
            flow.resolve('cancel')
            dispatch({ type: 'buffer/set', buffer: explainPrompt, cursor: explainPrompt.length })
          }}
        />
      )
    case 'model-picker':
      return (
        <ModelPickerCard
          current={flow.current}
          onPick={(modelId, scope) => {
            const resolved = cli.setModel(modelId)
            if (scope === 'default') setDefaultModel(resolved)
            dispatch({ type: 'model/set', model: resolved })
            dispatch({ type: 'flow/end' })
            dispatch({
              type: 'transcript/push',
              row: {
                kind: 'system',
                id: randomUUID(),
                text:
                  scope === 'default'
                    ? `${okGlyph()} default model -> ${resolved}`
                    : `${okGlyph()} model -> ${resolved} (session)`,
                tone: 'info',
              },
            })
          }}
          onCancel={() => dispatch({ type: 'flow/end' })}
        />
      )
    case 'effort-picker':
      return (
        <EffortSlider
          current={flow.current}
          onPick={(effort) => {
            const set = cli.setEffort?.(effort) ?? effort
            dispatch({ type: 'flow/end' })
            dispatch({
              type: 'transcript/push',
              row: { kind: 'system', id: randomUUID(), text: `${okGlyph()} effort -> ${set}`, tone: 'info' },
            })
          }}
          onCancel={() => dispatch({ type: 'flow/end' })}
        />
      )
    case 'plan-level-picker':
      return (
        <PlanLevelSlider
          current={flow.current}
          onPick={(level) => {
            const set = cli.setPlanLevel?.(level) ?? level
            dispatch({ type: 'flow/end' })
            dispatch({
              type: 'transcript/push',
              row: { kind: 'system', id: randomUUID(), text: `${okGlyph()} plan depth -> ${set}`, tone: 'info' },
            })
          }}
          onCancel={() => dispatch({ type: 'flow/end' })}
        />
      )
    case 'repo-picker':
      return (
        <RepoPickerCard
          repos={flow.repos}
          current={flow.current}
          onPick={(fullName) => {
            setActiveRepo(fullName)
            dispatch({ type: 'flow/end' })
            dispatch({
              type: 'transcript/push',
              row: { kind: 'system', id: randomUUID(), text: `${okGlyph()} active repo -> ${fullName}`, tone: 'info' },
            })
          }}
          onCancel={() => dispatch({ type: 'flow/end' })}
        />
      )
    case 'theme-picker':
      return (
        <ThemePicker
          current={loadActiveTheme()}
          onPick={(name) => {
            saveActiveTheme(name)
            dispatch({ type: 'flow/end' })
            dispatch({
              type: 'transcript/push',
              row: { kind: 'system', id: randomUUID(), text: `${okGlyph()} theme -> ${name}`, tone: 'info' },
            })
          }}
          onCancel={() => dispatch({ type: 'flow/end' })}
        />
      )
    case 'command-palette':
      return (
        <CommandPalette
          registry={props.registry}
          onPick={(command) => {
            const state = props.getState()
            const insert = `${command} `
            const next = state.buffer.slice(0, state.cursor) + insert + state.buffer.slice(state.cursor)
            dispatch({ type: 'flow/end' })
            dispatch({ type: 'buffer/set', buffer: next, cursor: state.cursor + insert.length })
          }}
          onCancel={() => dispatch({ type: 'flow/end' })}
        />
      )
  }
}

function okGlyph(): string {
  return '✓'
}

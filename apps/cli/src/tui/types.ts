import type { PermissionMode, UsageTotals } from '@orchentra/cli-core'
import type { UiCardSection, UiTabs } from '../commands/ui-output'

export interface CardRow {
  readonly kind: 'card'
  readonly id: string
  readonly title?: string
  readonly subtitle?: string
  readonly tabs?: UiTabs
  readonly sections: readonly UiCardSection[]
}

export interface ReasoningRow {
  readonly kind: 'reasoning'
  readonly id: string
  readonly text: string
  readonly startedAt: number
  readonly endedAt: number | null
  readonly expanded: boolean
}

export type TranscriptRow =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | {
      kind: 'tool_call'
      id: string
      /** Anthropic `tool_use_id`. Used to match incoming arg-deltas to the row. */
      toolUseId?: string
      name: string
      /**
       * When `streaming` is true, this is raw partial JSON streamed from the
       * provider — not guaranteed to parse. Once the finalize action lands the
       * value is replaced with the canonical JSON-encoded args string used by
       * the existing `summarizeToolArgs` render path.
       */
      input: string
      streaming?: boolean
    }
  | { kind: 'tool_result'; id: string; name?: string; preview: string; isError: boolean; expanded: boolean }
  | { kind: 'system'; id: string; text: string; tone?: 'info' | 'warn' }
  | { kind: 'stream'; id: string; text: string; label?: string }
  | { kind: 'error'; id: string; message: string }
  | { kind: 'done'; id: string; steps: number; usage: UsageTotals; model: string }
  | { kind: 'compacted'; id: string; dropped: number; saved: number }
  | ReasoningRow
  | CardRow

export type SuggestionTrigger = '/' | '@' | '!'

export interface SuggestionItem {
  /** Text inserted into the buffer when this item is accepted. */
  readonly value: string
  /** Display label (often `value` minus the trigger). */
  readonly label: string
  /** Optional dim description shown to the right of the label. */
  readonly description?: string
  /** Optional argument hint shown after the label (e.g. "<file>"). */
  readonly hint?: string
}

export interface SuggestionState {
  readonly open: boolean
  readonly trigger: SuggestionTrigger | null
  readonly query: string
  readonly items: readonly SuggestionItem[]
  readonly selected: number
  /** Buffer index of the trigger char (`/`, `@`, `!`). */
  readonly anchorStart: number
}

export interface PasteChip {
  readonly id: string
  readonly content: string
  readonly lines: number
}

export interface TurnStatus {
  readonly state: 'idle' | 'running' | 'cancelling'
  readonly startedAt: number | null
  readonly elapsedMs: number
  readonly tokens: UsageTotals
  /** Whimsical present-continuous verb shown in the footer for this turn. */
  readonly verb: string | null
}

export interface ActiveCardState {
  readonly id: string
  readonly title?: string
  readonly subtitle?: string
  readonly tabs?: import('../commands/ui-output').UiTabs
  readonly activeTab: number
  readonly sectionsByTab: readonly (readonly import('../commands/ui-output').UiCardSection[])[]
}

export interface TuiState {
  readonly buffer: string
  readonly cursor: number
  /** Draft saved while scrolling history; restored at index -1. */
  readonly draft: string
  /** -1 = live draft, 0 = most recent submission, increasing = older. */
  readonly historyIndex: number
  readonly history: readonly string[]
  readonly suggestions: SuggestionState
  readonly transcript: readonly TranscriptRow[]
  readonly turn: TurnStatus
  readonly mode: PermissionMode
  readonly model: string
  readonly pastes: Readonly<Record<string, PasteChip>>
  /** Timestamp (ms) until which the "press Ctrl+C again to exit" hint is shown. */
  readonly exitHintUntil: number | null
  /** Id of the assistant row currently being streamed into, if any. */
  readonly streamingRowId: string | null
  /**
   * Currently-focused interactive card, if any. The card lives in the live
   * region (not in Static), so the user can switch tabs with ←/→ or Tab and
   * dismiss with ↓/Esc. Once dismissed, the active tab's content is
   * committed into the transcript.
   */
  readonly activeCard: ActiveCardState | null
  /**
   * Active interactive flow (Anthropic OAuth login etc.). When set, the TUI
   * renders the corresponding overlay component and disables the main
   * input handler so the overlay owns keyboard input.
   */
  readonly activeFlow: ActiveFlowState | null
}

export type ActiveFlowState =
  | { readonly kind: 'anthropic-login' }
  | { readonly kind: 'model-picker'; readonly current: string }
  | {
      readonly kind: 'repo-picker'
      readonly repos: readonly import('../commands/ui-output').RepoPickerItem[]
      readonly current: string | null
    }
  | {
      readonly kind: 'confirmation-prompt'
      readonly request: import('./components/ConfirmationPrompt').PromptRequest
      readonly resolve: (choice: import('./components/ConfirmationPrompt').PromptChoice) => void
    }

export type TuiAction =
  | { type: 'buffer/set'; buffer: string; cursor: number }
  | { type: 'history/load'; entries: readonly string[] }
  | { type: 'history/prev' }
  | { type: 'history/next' }
  | { type: 'history/append'; text: string }
  | { type: 'suggestions/set'; state: SuggestionState }
  | { type: 'suggestions/close' }
  | { type: 'suggestions/move'; delta: number }
  | { type: 'transcript/push'; row: TranscriptRow }
  | { type: 'transcript/clear' }
  | { type: 'transcript/stream-begin'; rowId: string }
  | { type: 'transcript/stream-append'; rowId: string; delta: string }
  | { type: 'transcript/stream-end' }
  | { type: 'transcript/system-stream-begin'; rowId: string; label?: string }
  | { type: 'transcript/system-stream-append'; rowId: string; delta: string }
  | { type: 'transcript/system-stream-end' }
  | { type: 'transcript/reasoning-begin'; rowId: string; startedAt: number }
  | { type: 'transcript/reasoning-append'; rowId: string; delta: string }
  | { type: 'transcript/reasoning-end'; rowId: string; endedAt: number }
  | {
      type: 'transcript/tool-args-append'
      toolUseId: string
      toolName: string
      delta: string
    }
  | {
      type: 'transcript/tool-args-finalize'
      toolUseId: string
      /** Canonical JSON-encoded args (used by `summarizeToolArgs`). */
      input?: string
      /** Optional; only needed when the finalize lands without a prior partial. */
      toolName?: string
    }
  | { type: 'reasoning/toggle-last' }
  | { type: 'reasoning/toggle'; rowId: string }
  | { type: 'tool_result/toggle-last' }
  | { type: 'tool_result/toggle'; rowId: string }
  | { type: 'collapsible/toggle-last' }
  | { type: 'turn/start' }
  | { type: 'turn/cancelling' }
  | { type: 'turn/end' }
  | { type: 'turn/tick'; elapsedMs: number }
  | { type: 'verb/rotate'; verb: string }
  | { type: 'tokens/set'; usage: UsageTotals }
  | { type: 'mode/cycle' }
  | { type: 'mode/set'; mode: PermissionMode }
  | { type: 'model/set'; model: string }
  | { type: 'paste/add'; chip: PasteChip }
  | { type: 'exit-hint/show'; until: number }
  | { type: 'exit-hint/clear' }
  | { type: 'card/open'; card: ActiveCardState }
  | { type: 'card/set-tab'; index: number }
  | { type: 'card/dismiss' }
  | { type: 'flow/start'; flow: ActiveFlowState }
  | { type: 'flow/end' }

export const PERMISSION_MODE_CYCLE: readonly PermissionMode[] = [
  'prompt',
  'workspace-write',
  'read-only',
  'allow',
  'danger-full-access',
] as const

// Deprecated: import from `theme.ts` instead. Kept as a re-export so the
// existing call sites compile without churn.
export { THEME } from './theme'
import { THEME as _THEME } from './theme'
export const BRAND_GREEN = _THEME.brand

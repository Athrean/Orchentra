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

export type TranscriptRow =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool_call'; id: string; name: string; input: string }
  | { kind: 'tool_result'; id: string; preview: string; isError: boolean }
  | { kind: 'system'; id: string; text: string; tone?: 'info' | 'warn' }
  | { kind: 'stream'; id: string; text: string; label?: string }
  | { kind: 'error'; id: string; message: string }
  | { kind: 'done'; id: string; steps: number; usage: UsageTotals; model: string }
  | { kind: 'compacted'; id: string; dropped: number; saved: number }
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
  | { type: 'turn/start' }
  | { type: 'turn/cancelling' }
  | { type: 'turn/end' }
  | { type: 'turn/tick'; elapsedMs: number }
  | { type: 'tokens/set'; usage: UsageTotals }
  | { type: 'mode/cycle' }
  | { type: 'mode/set'; mode: PermissionMode }
  | { type: 'model/set'; model: string }
  | { type: 'paste/add'; chip: PasteChip }
  | { type: 'exit-hint/show'; until: number }
  | { type: 'exit-hint/clear' }

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

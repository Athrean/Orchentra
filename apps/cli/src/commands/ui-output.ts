/**
 * Structured UI events emitted by slash-command handlers. The TUI translates
 * these into transcript rows; non-TUI surfaces (one-shot mode, tests) can
 * collect them or print plaintext.
 */

export interface UiKVRow {
  readonly key: string
  readonly value: string
  readonly valueColor?: string
  readonly bold?: boolean
}

export interface UiCardSection {
  readonly title?: string
  readonly rows: readonly UiKVRow[]
}

export interface UiTabs {
  readonly items: readonly string[]
  readonly active: number
}

export type UiOutput =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'note'; readonly tone?: 'info' | 'warn'; readonly text: string }
  | {
      readonly kind: 'card'
      readonly title?: string
      readonly subtitle?: string
      readonly tabs?: UiTabs
      readonly sections: readonly UiCardSection[]
    }
  | {
      /**
       * Streaming text chunk. The first emit during a single command
       * invocation begins a streaming row; subsequent emits append to
       * the same row. The TUI ends the stream when the handler returns.
       */
      readonly kind: 'stream'
      readonly delta: string
      readonly label?: string
    }

export type UiSink = (output: UiOutput) => void

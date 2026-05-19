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
      /**
       * Section list for the currently-shown view. When `sectionsByTab` is
       * also provided, the TUI uses that for arrow-key tab switching and
       * `sections` is treated as the initial render (typically `sectionsByTab[tabs.active]`).
       */
      readonly sections: readonly UiCardSection[]
      /** Optional per-tab content. Required for interactive tab switching. */
      readonly sectionsByTab?: readonly (readonly UiCardSection[])[]
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
  | {
      /**
       * Open a full-bleed interactive flow inside the TUI. The TUI takes
       * over keyboard handling for the duration of the flow and surfaces
       * a status card; non-TUI surfaces fall back to the legacy
       * stdout-based prompt.
       */
      readonly kind: 'login-flow'
      readonly provider: 'anthropic'
    }
  | {
      /**
       * Open the arrow-key model picker. The TUI takes over input until
       * the user selects a model or escapes. Non-TUI surfaces ignore
       * this and the command falls back to its text path.
       */
      readonly kind: 'model-picker'
      readonly current: string
    }
  | {
      /**
       * Open the arrow-key repo picker. The TUI takes over input until
       * the user selects a repo or escapes. The selection is persisted
       * to `~/.config/orchentra/session.json` so subsequent repo-scoped
       * verbs default to it.
       */
      readonly kind: 'repo-picker'
      readonly repos: readonly RepoPickerItem[]
      readonly current: string | null
    }

export interface RepoPickerItem {
  readonly fullName: string
  readonly installed: boolean
  readonly monitored: boolean
}

export type UiSink = (output: UiOutput) => void

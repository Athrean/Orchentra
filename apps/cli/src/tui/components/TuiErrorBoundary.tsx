import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'

export interface TuiErrorBoundaryProps {
  /**
   * Children rendered while no error has been caught.
   */
  readonly children?: React.ReactNode
  /**
   * Optional session id surfaced in the fallback so the user can quote it
   * when filing an issue. Omitted line entirely when not provided.
   */
  readonly sessionId?: string
  /**
   * Optional terminal-state restorer. Called once, after `getDerivedStateFromError`
   * has flipped the boundary into its fallback frame, so callers can run Ink's
   * `cleanup()` to restore raw-mode / alt-screen state without tearing down the
   * React tree before the fallback is committed.
   */
  readonly onCleanup?: () => void
}

interface TuiErrorBoundaryState {
  readonly error: Error | null
}

/**
 * Top-level error boundary for the TUI. Catches render-phase exceptions in
 * any descendant component, renders a friendly fallback card, and gives
 * `runTui` a hook (`onCleanup`) to restore terminal state so the user is
 * not left with a half-redrawn frame, raw input mode, or a hidden cursor.
 *
 * Class component because `getDerivedStateFromError` and `componentDidCatch`
 * have no hook equivalent in React 19.
 */
export class TuiErrorBoundary extends React.Component<TuiErrorBoundaryProps, TuiErrorBoundaryState> {
  override state: TuiErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): TuiErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(): void {
    // Restore terminal state once. React calls componentDidCatch after the
    // fallback frame has rendered, so the user sees the fallback before any
    // Ink unmount that the caller might trigger.
    this.props.onCleanup?.()
  }

  override render(): React.ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const firstFrame = firstStackFrame(error)
    const sessionId = this.props.sessionId

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={THEME.danger} paddingX={1}>
        <Text color={THEME.danger} bold>
          Orchentra crashed
        </Text>
        <Box flexDirection="row">
          <Text>{error.name}: </Text>
          <Text color={THEME.danger}>{error.message}</Text>
        </Box>
        {firstFrame ? <Text dimColor>{firstFrame}</Text> : null}
        {sessionId ? <Text dimColor>{`session: ${sessionId}`}</Text> : null}
        <Text dimColor>Please file an issue at github.com/Athrean/Orchentra/issues</Text>
      </Box>
    )
  }
}

/**
 * Extract the first stack frame (e.g. `    at Boom (file.tsx:12:5)`) from an
 * error's stack string. Returns `null` if the stack is empty or absent.
 */
function firstStackFrame(error: Error): string | null {
  if (!error.stack) return null
  const lines = error.stack.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('at ')) return trimmed
  }
  return null
}

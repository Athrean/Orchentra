import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { Text } from 'ink'
import { TuiErrorBoundary } from '../../src/tui/components/TuiErrorBoundary'

// React logs caught errors via console.error during the boundary lifecycle.
// Silence that noise so the test output stays readable while still letting
// the boundary itself do its job.
function silenceConsoleError(): () => void {
  const original = console.error
  console.error = (): void => {}
  return (): void => {
    console.error = original
  }
}

function Boom({ message }: { message: string }): React.ReactElement {
  throw new Error(message)
}

describe('TuiErrorBoundary', () => {
  let restoreConsole: () => void = (): void => {}

  beforeEach(() => {
    restoreConsole = silenceConsoleError()
  })

  afterEach(() => {
    restoreConsole()
  })

  test('renders children when no error is thrown', () => {
    const { lastFrame } = render(
      <TuiErrorBoundary>
        <Text>hello world</Text>
      </TuiErrorBoundary>,
    )
    expect(lastFrame() ?? '').toContain('hello world')
  })

  test('renders a fallback card with the error message when a child throws', () => {
    const { lastFrame } = render(
      <TuiErrorBoundary>
        <Boom message="kaboom in render" />
      </TuiErrorBoundary>,
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('Orchentra crashed')
    expect(out).toContain('kaboom in render')
  })

  test('fallback includes the first stack frame', () => {
    const { lastFrame } = render(
      <TuiErrorBoundary>
        <Boom message="trace me" />
      </TuiErrorBoundary>,
    )
    const out = lastFrame() ?? ''
    // First stack frame mentions either the throwing component or the test file.
    expect(out).toMatch(/at\s+\S+/)
  })

  test('fallback shows session id when provided', () => {
    const { lastFrame } = render(
      <TuiErrorBoundary sessionId="sess-abc-123">
        <Boom message="boom" />
      </TuiErrorBoundary>,
    )
    expect(lastFrame() ?? '').toContain('sess-abc-123')
  })

  test('fallback omits the session line when no id is provided', () => {
    const { lastFrame } = render(
      <TuiErrorBoundary>
        <Boom message="boom" />
      </TuiErrorBoundary>,
    )
    expect(lastFrame() ?? '').not.toContain('session:')
  })

  test('fallback hints how to file an issue', () => {
    const { lastFrame } = render(
      <TuiErrorBoundary>
        <Boom message="boom" />
      </TuiErrorBoundary>,
    )
    expect(lastFrame() ?? '').toContain('file an issue')
  })

  test('invokes cleanup callback when an error is caught', () => {
    let cleaned = 0
    render(
      <TuiErrorBoundary onCleanup={(): void => void cleaned++}>
        <Boom message="trigger cleanup" />
      </TuiErrorBoundary>,
    )
    expect(cleaned).toBe(1)
  })

  test('cleanup is not invoked when there is no error', () => {
    let cleaned = 0
    render(
      <TuiErrorBoundary onCleanup={(): void => void cleaned++}>
        <Text>ok</Text>
      </TuiErrorBoundary>,
    )
    expect(cleaned).toBe(0)
  })
})

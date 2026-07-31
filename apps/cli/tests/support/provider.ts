import type { Provider, ProviderRequest, ProviderStreamEvent, SharedToolState } from '@orchentra/cli-core'

/**
 * A Provider that replays one prepared event list per turn, optionally
 * exposing each outgoing request so a test can assert on what was sent.
 *
 * Deliberately a copy of the cli-core helper of the same name rather than a
 * shared workspace package. This eight-line stub is the only fixture that
 * crosses a package boundary, and a `test-support` package would cost a
 * package.json, a tsconfig, turbo wiring and a dependency edge from every
 * package's tests to carry it. Revisit if a second fixture ever needs to
 * cross.
 */
export function scriptedProvider(
  turns: ProviderStreamEvent[][],
  onRequest?: (request: ProviderRequest) => void,
): Provider {
  let index = 0
  return {
    async *stream(request) {
      onRequest?.(request)
      const turn = turns[index++] ?? []
      for (const event of turn) yield event
    },
  }
}

/** A Provider that ends the turn immediately without emitting any text. */
export function silentProvider(): Provider {
  return {
    async *stream(): AsyncGenerator<ProviderStreamEvent> {
      yield { kind: 'finish', stopReason: 'end_turn' }
    },
  }
}

/** SharedToolState with an inert task store, for tests that never spawn tasks. */
export function sharedState(): SharedToolState {
  return {
    taskStore: {
      create: () => {
        throw new Error('not used')
      },
      get: () => undefined,
      list: () => [],
      update: () => {},
      cancel: () => {},
    },
    todos: [],
    agentCounter: 0,
    planMode: false,
  }
}

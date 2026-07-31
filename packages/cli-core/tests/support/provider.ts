import type { Provider, ProviderStreamEvent } from '../../src/runtime/provider'

/**
 * A Provider that replays one prepared event list per turn.
 *
 * Turns are consumed in order; once the script runs out, further turns yield
 * nothing, which surfaces an unexpected extra round-trip as an empty response
 * rather than a hang.
 */
export function scriptedProvider(turns: ProviderStreamEvent[][]): Provider {
  let index = 0
  return {
    async *stream() {
      const turn = turns[index++] ?? []
      for (const event of turn) yield event
    },
  }
}

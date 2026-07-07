export type DoublePressResult = 'first' | 'again'

export interface DoublePressDecision {
  /** 'first' arms the window; 'again' fires when a second press lands in time. */
  readonly result: DoublePressResult
  /** Next armed deadline (ms epoch), or null once a double-press has fired. */
  readonly armedUntil: number | null
}

/**
 * Pure double-press primitive: decide whether `now` is the second press within
 * `windowMs` of a prior arming. State lives in the caller (the reducer's
 * `exitHintUntil`), so this stays a stateless, testable decision — used for
 * ctrl+c-twice-to-exit and reusable for any future double-key binding.
 */
export function doublePressDecision(armedUntil: number | null, now: number, windowMs: number): DoublePressDecision {
  if (armedUntil !== null && now <= armedUntil) {
    return { result: 'again', armedUntil: null }
  }
  return { result: 'first', armedUntil: now + windowMs }
}

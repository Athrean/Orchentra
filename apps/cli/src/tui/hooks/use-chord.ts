import { useEffect, useMemo, useRef } from 'react'
import type { Key } from 'ink'

/**
 * Predicate that decides whether a given keystroke matches either the prefix
 * or the action half of a chord. Mirrors the `(input, key)` shape Ink hands to
 * `useInput`.
 */
export type KeyMatcher = (input: string, key: Key) => boolean

/**
 * `(input, key) => boolean` interceptor returned by `useChord`.
 *
 * Return value semantics:
 *  - `true`  — the chord state machine consumed this keystroke; the caller
 *              must NOT process it any further this tick.
 *  - `false` — the keystroke was not relevant to the chord (or it dropped a
 *              stale pending prefix); the caller should handle it normally.
 */
export type ChordInterceptor = (input: string, key: Key) => boolean

export interface ChordSpec {
  readonly prefix: KeyMatcher
  readonly action: KeyMatcher
  readonly timeoutMs: number
  readonly onMatch: () => void
}

export interface ChordHandle {
  readonly handle: ChordInterceptor
  /** Clears any pending prefix state. Safe to call repeatedly. */
  readonly reset: () => void
}

/**
 * Pure factory for the chord state machine. Exposed for tests; the React-side
 * `useChord` hook below is a thin wrapper that ties lifetime to the component.
 *
 * Why a factory instead of just the hook? The state machine is trivial but
 * easy to get wrong on edge cases (timeout expiry, mismatched second key);
 * keeping it as a plain function lets us unit-test it without a renderer.
 */
export function createChord(spec: ChordSpec): ChordHandle {
  let pending = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const reset = (): void => {
    pending = false
    clearTimer()
  }

  const handle: ChordInterceptor = (input, key) => {
    if (pending) {
      // Pending state always resolves on the next keystroke — either by
      // firing the match (consumed) or by dropping the pending state and
      // letting the keystroke through to normal handling.
      reset()
      if (spec.action(input, key)) {
        spec.onMatch()
        return true
      }
      return false
    }
    if (spec.prefix(input, key)) {
      pending = true
      timer = setTimeout(() => {
        pending = false
        timer = null
      }, spec.timeoutMs)
      return true
    }
    return false
  }

  return { handle, reset }
}

/**
 * React hook form: mounts a chord state machine for the lifetime of the
 * component. Returns an interceptor the caller plugs into its `useInput`
 * handler before normal key processing.
 *
 * The hook captures the latest `onMatch` in a ref so callers can pass an
 * inline closure without re-creating the chord every render.
 */
export function useChord(
  prefix: KeyMatcher,
  action: KeyMatcher,
  timeoutMs: number,
  onMatch: () => void,
): ChordInterceptor {
  const onMatchRef = useRef(onMatch)
  onMatchRef.current = onMatch

  const chord = useMemo(
    () =>
      createChord({
        prefix,
        action,
        timeoutMs,
        onMatch: () => onMatchRef.current(),
      }),
    [prefix, action, timeoutMs],
  )

  useEffect(() => {
    return () => chord.reset()
  }, [chord])

  return chord.handle
}

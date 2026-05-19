import { useEffect, useState } from 'react'

export const DIM_TICK_MS = 1500

/**
 * React hook that returns a `Date.now()` snapshot which advances on a
 * fixed interval. Components consuming it re-render every `intervalMs`
 * milliseconds, which is how we drive time-based visual transitions
 * (e.g. dimming completed tool-call rows after 5s) without forcing every
 * other render path to do its own clock tracking.
 *
 * Default interval is `DIM_TICK_MS` (1.5s) — fast enough that a 5s
 * dim transition lands within one tick of the threshold, slow enough
 * that we don't thrash React for a purely visual effect.
 */
export function useNow(intervalMs: number = DIM_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

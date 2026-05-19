import { useEffect, useState } from 'react'

export interface UseShimmerOptions {
  readonly active: boolean
  readonly intervalMs?: number
}

/**
 * Returns a monotonically-increasing tick counter that advances on a fixed
 * interval while `active` is true. When `active` flips false the tick freezes
 * at its current value; flipping back to true resumes from there.
 *
 * Callers typically map `tick % N` to a colour or glyph to produce a
 * lightweight "breathing" animation without re-rendering the whole tree.
 */
export function useShimmer(options: UseShimmerOptions): number {
  const intervalMs = options.intervalMs ?? 150
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!options.active) return
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [options.active, intervalMs])

  return tick
}

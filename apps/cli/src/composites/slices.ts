import type { ArchitectPlan } from './architect'

/** One unit of buildable work: implement the target file(s) for an intent. */
export interface Slice {
  id: string
  title: string
  intent: string
  files: string[]
  dependsOn: string[]
}

/**
 * Derive ordered vertical slices from an architect plan: one slice per
 * non-directory scaffold entry, targeting that file with its purpose as the
 * intent. Directory entries (trailing `/`) carry no work and are dropped.
 */
export function planSlices(plan: ArchitectPlan): Slice[] {
  return plan.scaffold
    .filter((entry) => !entry.path.endsWith('/'))
    .map((entry) => ({
      id: entry.path,
      title: entry.purpose || entry.path,
      intent: entry.purpose || entry.path,
      files: [entry.path],
      dependsOn: [],
    }))
}

/**
 * Group slices into waves that can run in parallel. A slice joins the current
 * wave only when every dependency is already done and no slice already in the
 * wave touches one of its files. Order within a wave follows the input order.
 */
export function parallelWaves(slices: Slice[]): Slice[][] {
  const waves: Slice[][] = []
  const done = new Set<string>()
  let remaining = slices

  while (remaining.length > 0) {
    const wave: Slice[] = []
    const claimed = new Set<string>()
    const leftover: Slice[] = []

    for (const s of remaining) {
      const ready = s.dependsOn.every((d) => done.has(d))
      const free = s.files.every((f) => !claimed.has(f))
      if (ready && free) {
        wave.push(s)
        for (const f of s.files) claimed.add(f)
      } else {
        leftover.push(s)
      }
    }

    // No slice could start → unsatisfiable deps; emit the rest as a final wave
    // rather than loop forever.
    if (wave.length === 0) {
      waves.push(leftover)
      break
    }

    waves.push(wave)
    for (const s of wave) done.add(s.id)
    remaining = leftover
  }

  return waves
}

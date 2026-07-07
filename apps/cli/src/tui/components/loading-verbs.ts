// Whimsical present-continuous verbs surfaced in the footer while a turn is
// running. The rotating verb makes long reasoning loops feel like the agent
// is *doing* something rather than just hanging on "thinking…".
const VERBS = [
  'Bloviating',
  'Brewing',
  'Cogitating',
  'Concocting',
  'Crystallising',
  'Distilling',
  'Effervescing',
  'Fermenting',
  'Forging',
  'Hatching',
  'Marinating',
  'Mulling',
  'Percolating',
  'Plotting',
  'Pondering',
  'Ruminating',
  'Sautéing',
  'Scheming',
  'Simmering',
  'Smelting',
  'Stewing',
  'Synthesising',
  'Tinkering',
  'Whisking',
] as const

export function pickVerb(rng: () => number = Math.random): string {
  const i = Math.floor(rng() * VERBS.length)
  return VERBS[i] ?? VERBS[0]!
}

/**
 * Deterministic verb selection from the same pool as `pickVerb`. Same id
 * always maps to the same verb, so reasoning rows do not flicker between
 * verbs across re-renders.
 */
export function verbForId(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const index = (h >>> 0) % VERBS.length
  return VERBS[index] ?? VERBS[0]!
}

export const LOADING_VERBS = VERBS

// Past-tense verbs shown on the completed-turn ("done") row, so a finished turn
// reads as an accomplishment rather than a bare "done" every time.
const COMPLETION_VERBS = [
  'done',
  'finished',
  'wrapped up',
  'sorted',
  'shipped',
  'sealed',
  'buttoned up',
  'squared away',
] as const

/** Deterministic completion verb for a row id — stable across re-renders. */
export function completionVerbForId(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const index = (h >>> 0) % COMPLETION_VERBS.length
  return COMPLETION_VERBS[index] ?? COMPLETION_VERBS[0]!
}

export const COMPLETION_VERBS_LIST = COMPLETION_VERBS

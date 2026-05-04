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

export const LOADING_VERBS = VERBS

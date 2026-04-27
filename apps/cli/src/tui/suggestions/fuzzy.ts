/**
 * Tiny fuzzy scorer with no deps. Higher score = better match.
 * Matches are case-insensitive subsequence; bonuses for:
 *   - prefix match
 *   - consecutive runs
 *   - matches after a separator (`-`, `_`, `/`, `.`, ` `)
 *   - shorter total length
 *
 * Returns `null` when the query is not a subsequence of the candidate.
 */
export interface FuzzyResult {
  readonly score: number
  /** Indices of the candidate characters that matched the query, in order. */
  readonly matched: readonly number[]
}

export function fuzzyScore(query: string, candidate: string): FuzzyResult | null {
  if (query.length === 0) return { score: 0, matched: [] }
  const q = query.toLowerCase()
  const c = candidate.toLowerCase()

  let qi = 0
  let lastMatch = -1
  let consecutive = 0
  let score = 0
  const matched: number[] = []

  for (let i = 0; i < c.length && qi < q.length; i++) {
    if (c[i] === q[qi]) {
      let bonus = 1
      if (i === 0) bonus += 6
      else if (isSeparator(c[i - 1])) bonus += 4
      else if (
        candidate[i] >= 'A' &&
        candidate[i] <= 'Z' &&
        candidate[i - 1] &&
        candidate[i - 1] >= 'a' &&
        candidate[i - 1] <= 'z'
      ) {
        bonus += 3
      }
      if (lastMatch === i - 1) {
        consecutive += 1
        bonus += consecutive * 2
      } else {
        consecutive = 0
      }
      score += bonus
      lastMatch = i
      matched.push(i)
      qi += 1
    }
  }

  if (qi < q.length) return null

  // Penalty for very long candidates relative to match
  score -= Math.max(0, c.length - matched.length) * 0.05

  return { score, matched }
}

function isSeparator(ch: string): boolean {
  return ch === '-' || ch === '_' || ch === '/' || ch === '.' || ch === ' ' || ch === '\\'
}

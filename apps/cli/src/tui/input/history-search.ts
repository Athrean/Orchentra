/**
 * Pure matching for incremental history reverse-search (ctrl+f). The reducer
 * owns the `HistorySearchState`; these helpers just answer "which history
 * entry matches" so the transition logic stays trivially testable.
 *
 * History is stored oldest→newest, so "older" means a lower index and the
 * newest match is the highest matching index — matching readline's
 * reverse-i-search, which surfaces the most recent hit first.
 */
export interface HistorySearchState {
  readonly query: string
  /** Index into `history` of the current match, or null when nothing matches. */
  readonly matchIndex: number | null
}

/** Newest history entry containing `query` (case-insensitive). Empty query
 * matches nothing so the prompt shows before the user has typed. */
export function findLatestMatch(history: readonly string[], query: string): number | null {
  if (query.length === 0) return null
  const q = query.toLowerCase()
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].toLowerCase().includes(q)) return i
  }
  return null
}

/** Next match strictly older (toward index 0) or newer (toward the end) than
 * `from`. Returns `from` unchanged when there is no further match that way, so
 * repeated cycling parks on the last hit instead of wrapping. */
export function findAdjacentMatch(
  history: readonly string[],
  query: string,
  from: number,
  direction: 'older' | 'newer',
): number {
  if (query.length === 0) return from
  const q = query.toLowerCase()
  const step = direction === 'older' ? -1 : 1
  for (let i = from + step; i >= 0 && i < history.length; i += step) {
    if (history[i].toLowerCase().includes(q)) return i
  }
  return from
}

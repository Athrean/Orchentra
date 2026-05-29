/**
 * Discriminated result for any external read (graph DB, GitHub API). The UI
 * branches on `status` and must NEVER map `unauthorized` / `error` to a zero
 * metric — a failed or forbidden read is not the same as "genuinely empty".
 */
export type ReadStatus = 'ok' | 'empty' | 'unauthorized' | 'error'

export interface ReadResult<T> {
  status: ReadStatus
  data: T
}

/**
 * Wrap a graph-DB read in the canonical try/catch → fallback pattern (cloned
 * from lib/graph/usage.ts). On success returns `ok` (or `empty` when the data
 * is empty per `isEmpty`); on throw logs and returns `error` with the fallback.
 * The graph DB is our own process, so it never returns `unauthorized`.
 */
export async function safeGraphRead<T>(
  label: string,
  fallback: T,
  read: () => Promise<T>,
  isEmpty: (data: T) => boolean = defaultIsEmpty,
): Promise<ReadResult<T>> {
  try {
    const data = await read()
    return { status: isEmpty(data) ? 'empty' : 'ok', data }
  } catch (err) {
    console.error(`[graph] read failed (${label}):`, err)
    return { status: 'error', data: fallback }
  }
}

function defaultIsEmpty(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0
  return data === null || data === undefined
}

/**
 * Thin wrapper around `octokit.paginate` that caps total items returned.
 *
 * The cap is the safety belt for "list everything" calls. A misconfigured
 * filter can otherwise tail-fetch tens of thousands of pages and burn the
 * install's hourly quota. Hitting the cap throws — we surface the runaway
 * fast instead of returning a silently truncated array.
 */

import type { OctokitLike } from './octokit'

export interface PaginateAllOptions {
  /** Hard cap on total items collected. Throws when exceeded. */
  cap?: number
  /** Page size hint forwarded to GitHub (default 100, the max). */
  perPage?: number
}

const DEFAULT_CAP = 1000
const DEFAULT_PER_PAGE = 100

/**
 * Paginate a GitHub API request and collect every item up to `cap`.
 *
 * @throws Error when collected items exceed the cap. The error names the
 *         endpoint so the caller can tighten the filter or raise the cap
 *         intentionally.
 */
export async function paginateAll<T>(
  octokit: OctokitLike,
  endpoint: string,
  parameters: Record<string, unknown> = {},
  options: PaginateAllOptions = {},
): Promise<T[]> {
  const cap = options.cap ?? DEFAULT_CAP
  const perPage = options.perPage ?? DEFAULT_PER_PAGE

  const collected: T[] = []
  await octokit.paginate(
    endpoint as never,
    { per_page: perPage, ...parameters } as never,
    (response: { data: T[] }, done?: () => void) => {
      for (const item of response.data) {
        if (collected.length >= cap) {
          throw new Error(
            `paginateAll(${endpoint}) exceeded cap of ${cap} items. Tighten the filter or pass a larger cap.`,
          )
        }
        collected.push(item)
      }
      // Allow the caller's `done` shortcircuit if `octokit.paginate` provided
      // one (it does on real Octokit; on test fakes the arg may be undefined).
      if (done && collected.length >= cap) done()
      return collected as never
    },
  )
  return collected
}

export { DEFAULT_CAP, DEFAULT_PER_PAGE }

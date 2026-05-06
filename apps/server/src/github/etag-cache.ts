/**
 * Process-local ETag cache for conditional GitHub requests.
 *
 * Polling-style reads (workflow runs, issues lists, etc.) often return the
 * same body run after run. Sending `If-None-Match: <etag>` lets the server
 * answer with a 304 — both sides save bandwidth and the response does NOT
 * count against the install's hourly quota when the body is unchanged.
 *
 * Scope of this slice: in-memory only. Cross-process persistence (Redis or a
 * Postgres-backed store) is explicitly deferred to a later slice.
 *
 * Eviction: simple LRU. Each `get` re-keys the entry to the most-recent
 * position; `set` evicts the oldest entry once `maxEntries` is reached.
 */

export interface ETagEntry<T = unknown> {
  etag: string
  body: T
  /** Optional original status code (e.g. 200) preserved for callers. */
  status?: number
}

export interface ETagCacheOptions {
  maxEntries?: number
}

const DEFAULT_MAX_ENTRIES = 256

export class ETagCache<T = unknown> {
  private readonly max: number
  private readonly store = new Map<string, ETagEntry<T>>()

  constructor(options: ETagCacheOptions = {}) {
    this.max = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  }

  /** Compose a stable cache key from request shape + tenant scope. */
  static key(orgId: string | null, method: string, url: string): string {
    return `${orgId ?? '_global'}:${method.toUpperCase()}:${url}`
  }

  get(key: string): ETagEntry<T> | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    // Re-insert to refresh LRU order.
    this.store.delete(key)
    this.store.set(key, entry)
    return entry
  }

  set(key: string, entry: ETagEntry<T>): void {
    if (this.store.has(key)) this.store.delete(key)
    this.store.set(key, entry)
    while (this.store.size > this.max) {
      const oldest = this.store.keys().next().value
      if (oldest === undefined) break
      this.store.delete(oldest)
    }
  }

  size(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }
}

/** Module-singleton cache used by adapter callsites. Tests construct their own. */
export const sharedETagCache: ETagCache = new ETagCache()

/**
 * Convenience for adapter callers: try a conditional GET, fall back to the
 * cached body when the upstream returns 304. Adapter modules supply the
 * `requester` (an Octokit `request` callable that respects `If-None-Match`)
 * and decide which endpoints are safe to cache.
 */
export interface ConditionalRequestArgs {
  orgId: string | null
  method: string
  url: string
  /** Octokit-shaped request executor that accepts headers + returns { status, data, headers }. */
  requester: (headers: Record<string, string>) => Promise<{
    status: number
    data: unknown
    headers: Record<string, string | undefined>
  }>
  cache?: ETagCache
}

export interface ConditionalRequestResult<T> {
  fromCache: boolean
  status: number
  data: T
  etag: string | null
}

export async function conditionalRequest<T>(args: ConditionalRequestArgs): Promise<ConditionalRequestResult<T>> {
  const cache = args.cache ?? sharedETagCache
  const key = ETagCache.key(args.orgId, args.method, args.url)
  const cached = cache.get(key)

  const headers: Record<string, string> = {}
  if (cached) headers['If-None-Match'] = cached.etag

  const res = await args.requester(headers)

  if (res.status === 304 && cached) {
    return { fromCache: true, status: 304, data: cached.body as T, etag: cached.etag }
  }

  const newEtag = res.headers.etag ?? null
  if (newEtag) {
    cache.set(key, { etag: newEtag, body: res.data, status: res.status })
  }
  return { fromCache: false, status: res.status, data: res.data as T, etag: newEtag }
}

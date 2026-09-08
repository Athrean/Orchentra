import { setTimeout as delay } from 'node:timers/promises'
import robotsParser from 'robots-parser'
import { fetchPage, type WebPage } from './page'
import { parseWebUrl, requestWeb, WebError, type WebRequestOptions } from './http'

export interface CrawlInput {
  url: string
  max_pages?: number
  max_depth?: number
}
export interface CrawlResult {
  pages: WebPage[]
  skipped: Array<{ url: string; reason: string }>
  limitReached: boolean
}

/** Same-origin breadth-first crawl. Bounded pages, depth, queue, body, output and duration. */
export async function crawlWeb(input: CrawlInput, options: WebRequestOptions = {}): Promise<CrawlResult> {
  const start = parseWebUrl(input.url)
  const signal = AbortSignal.any([AbortSignal.timeout(60_000), ...(options.signal ? [options.signal] : [])])
  const requestOptions = { ...options, signal, origin: start.origin }
  const robotsUrl = new URL('/robots.txt', start).href
  const response = await requestWeb(robotsUrl, { ...requestOptions, maxBytes: 256 * 1024 })
  if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
    throw new WebError('http_error', `Cannot establish crawl policy: robots.txt returned HTTP ${response.status}`)
  }
  const robots = robotsParser(robotsUrl, response.status === 404 ? '' : response.body)
  const interval = Math.max(250, (robots.getCrawlDelay('Orchentra') ?? 0) * 1000)
  const maxPages = input.max_pages ?? 5
  const maxDepth = input.max_depth ?? 1
  const result: CrawlResult = { pages: [], skipped: [], limitReached: false }
  const queue = [{ url: start.href, depth: 0 }]
  const seen = new Set<string>()
  let attempts = 0
  while (queue.length && attempts < maxPages) {
    signal.throwIfAborted()
    const entry = queue.shift()!
    if (seen.has(entry.url)) continue
    seen.add(entry.url)
    if (robots.isAllowed(entry.url, 'Orchentra') === false) {
      result.skipped.push({ url: entry.url, reason: 'robots.txt disallows crawling' })
      continue
    }
    await delay(interval, undefined, { signal })
    attempts++
    try {
      const page = await fetchPage(entry.url, {
        ...requestOptions,
        maxLength: 6000,
        admitUrl: (url) => robots.isAllowed(url.href, 'Orchentra') !== false,
      })
      result.pages.push(page)
      seen.add(page.url)
      if (entry.depth < maxDepth) {
        for (const href of page.links) {
          const url = parseWebUrl(href)
          if (url.origin === start.origin && !seen.has(url.href) && queue.length < 100)
            queue.push({ url: url.href, depth: entry.depth + 1 })
        }
      }
    } catch (error) {
      signal.throwIfAborted()
      result.skipped.push({ url: entry.url, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  result.limitReached = queue.length > 0
  return result
}

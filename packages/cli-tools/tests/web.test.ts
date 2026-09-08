import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { gzipSync } from 'node:zlib'
import { isPublicAddress, parseWebUrl, requestWeb } from '../src/web/http'
import { fetchPage } from '../src/web/page'
import { crawlWeb } from '../src/web/crawl'
import { parseSearchResponse } from '../src/web/search'
import { DefaultToolRegistry } from '../src/tool-registry'

let server: ReturnType<typeof Bun.serve>
let base: string
const visited: string[] = []
beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      visited.push(path)
      if (path === '/robots.txt') return new Response('User-agent: *\nDisallow: /secret\n')
      if (path === '/redirect') return Response.redirect(base + '/page')
      if (path === '/redirect-secret') return Response.redirect(base + '/secret')
      if (path === '/redirect-away') return Response.redirect('http://example.com/')
      if (path === '/large')
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(1024))
              controller.enqueue(new Uint8Array(1024))
              controller.close()
            },
          }),
        )
      if (path === '/slow') return new Promise((resolve) => setTimeout(() => resolve(new Response('late')), 1000))
      if (path === '/compressed')
        return new Response(gzipSync('x'.repeat(10000)), {
          headers: { 'content-encoding': 'gzip', 'content-type': 'text/plain' },
        })
      if (path === '/binary') return new Response('bytes', { headers: { 'content-type': 'application/pdf' } })
      return new Response(
        `<html><head><title>Fixture</title><script>HIDDEN SCRIPT</script></head><body><nav>HIDDEN NAV</nav><main><h1>Readable title</h1><p>Useful paragraph.</p><a href="/page">Page</a><a href="/secret">Secret</a><a href="/redirect-secret">Redirect</a><a href="https://example.com">External</a></main></body></html>`,
        { headers: { 'content-type': 'text/html' } },
      )
    },
  })
  base = server.url.origin
})
afterAll(() => server.stop(true))

describe('web retrieval boundary', () => {
  test('blocks private, encoded loopback, credentials, and non-web URLs', async () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '169.254.169.254',
      '::1',
      '::ffff:127.0.0.1',
      'fe80::1',
      '2001:db8::1',
    ])
      expect(isPublicAddress(address)).toBe(false)
    expect(isPublicAddress('8.8.8.8')).toBe(true)
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
    for (const url of ['file:///etc/passwd', 'https://a:b@example.com']) expect(() => parseWebUrl(url)).toThrow()
    await expect(requestWeb('http://2130706433')).rejects.toThrow('blocked')
    await expect(requestWeb(base)).rejects.toThrow('blocked')
  })
  test('extracts readable text and source metadata, resolving links', async () => {
    const page = await fetchPage(base, { allowPrivate: true })
    expect(page.content).toContain('Readable title\n')
    expect(page.content).toContain('Useful paragraph.')
    expect(page.content).not.toContain('HIDDEN')
    expect(page.links).toContain(base + '/page')
    expect(page.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(page.truncated).toBe(false)
    const shorter = await fetchPage(base, { allowPrivate: true, maxLength: 5 })
    expect(shorter.content).toHaveLength(5)
    expect(shorter.truncated).toBe(true)
    expect(shorter.contentHash).toBe(page.contentHash)
  })
  test('validates redirects and enforces origin admission', async () => {
    expect((await fetchPage(base + '/redirect', { allowPrivate: true })).url).toBe(base + '/page')
    await expect(fetchPage(base + '/redirect-away', { allowPrivate: true, origin: base })).rejects.toThrow('origin')
  })
  test('caps undeclared and decompressed response bytes', async () => {
    await expect(requestWeb(base + '/large', { allowPrivate: true, maxBytes: 1500 })).rejects.toThrow('exceeds')
    await expect(requestWeb(base + '/compressed', { allowPrivate: true, maxBytes: 1500 })).rejects.toThrow('exceeds')
    expect((await fetchPage(base + '/compressed', { allowPrivate: true })).content).toHaveLength(10000)
    await expect(fetchPage(base + '/binary', { allowPrivate: true })).rejects.toThrow('Unsupported content type')
  })
  test('cancellation stops pending network work', async () => {
    const abort = new AbortController()
    const pending = fetchPage(base + '/slow', { allowPrivate: true, signal: abort.signal })
    setTimeout(() => abort.abort(), 10)
    await expect(pending).rejects.toThrow()
  })
  test('crawler respects robots on initial URLs and redirects, origin, depth, and attempt limits', async () => {
    visited.length = 0
    const result = await crawlWeb({ url: base, max_pages: 4, max_depth: 1 }, { allowPrivate: true })
    expect(result.pages).toHaveLength(2)
    expect(visited).not.toContain('/secret')
    expect(result.skipped.some((item) => item.reason.includes('robots'))).toBe(true)
    expect(result.skipped.some((item) => item.reason.includes('crawl policy'))).toBe(true)
    expect((await crawlWeb({ url: base, max_pages: 1 }, { allowPrivate: true })).pages).toHaveLength(1)
  })
  test('registry bounds model arguments and returns cancellation as structured failure', async () => {
    const registry = new DefaultToolRegistry()
    const ctx = { sessionId: 'web-test', cwd: '/tmp' }
    const invalid = await registry.execute('web_crawl', { url: base, max_pages: 100 }, ctx)
    expect(invalid.isError).toBe(true)
    const abort = new AbortController()
    abort.abort()
    expect((await registry.execute('web_fetch', { url: base }, { ...ctx, signal: abort.signal })).data).toEqual({
      code: 'cancelled',
    })
  })
})

describe('search provider contract', () => {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: 'Title\nURL: https://example.com\nContent' }] },
  })
  test('reads JSON and SSE without dropping citations', () => {
    expect(parseSearchResponse(payload)).toContain('https://example.com')
    expect(parseSearchResponse(`event: message\ndata: ${payload}\n\n`)).toBe(parseSearchResponse(payload))
  })
  test('rejects malformed, mismatched, and failed envelopes', () => {
    for (const body of [
      '{}',
      '{invalid',
      JSON.stringify({ id: 1, error: { message: 'denied' } }),
      JSON.stringify({ id: 1, result: { content: [], isError: true } }),
      JSON.stringify({ id: 1, result: {} }),
    ])
      expect(() => parseSearchResponse(body)).toThrow()
  })
})

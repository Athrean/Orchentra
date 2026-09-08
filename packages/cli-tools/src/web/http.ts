import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

export class WebError extends Error {
  constructor(
    readonly code:
      | 'invalid_url'
      | 'blocked_address'
      | 'http_error'
      | 'too_large'
      | 'unsupported_content'
      | 'invalid_response'
      | 'rate_limited',
    message: string,
  ) {
    super(message)
    this.name = 'WebError'
  }
}

const blockedV4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blockedV4.addSubnet(address, prefix)
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
const blockedV6 = new BlockList()
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
] as const) {
  blockedV6.addSubnet(address, prefix, 'ipv6')
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !blockedV4.check(address)
  return family === 6 && globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6')
}

export function parseWebUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new WebError('invalid_url', 'Expected an absolute HTTP or HTTPS URL')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new WebError('invalid_url', 'Only HTTP(S) URLs without embedded credentials are supported')
  }
  url.hash = ''
  return url
}

export interface WebRequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
  maxBytes?: number
  allowPrivate?: boolean
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  /** Crawl redirects must remain in the admitted origin. */
  origin?: string
  admitUrl?: (url: URL) => boolean
}

export interface WebResponse {
  url: string
  status: number
  contentType: string
  body: string
  bytes: number
}

/** Bounded streaming with DNS pinned to the address that passed admission. */
export async function requestWeb(raw: string, options: WebRequestOptions = {}): Promise<WebResponse> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(options.timeoutMs ?? 30_000),
    ...(options.signal ? [options.signal] : []),
  ])
  let url = parseWebUrl(raw)
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024
  for (let redirects = 0; redirects <= 5; redirects++) {
    signal.throwIfAborted()
    if (options.admitUrl && !options.admitUrl(url))
      throw new WebError('blocked_address', 'URL is disallowed by crawl policy')
    if (options.origin && url.origin !== options.origin)
      throw new WebError('blocked_address', 'Redirect left the crawl origin')
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await abortableLookup(hostname, signal)
    signal.throwIfAborted()
    if (!addresses.length || (!options.allowPrivate && addresses.some((entry) => !isPublicAddress(entry.address)))) {
      throw new WebError('blocked_address', 'Private, loopback, and reserved destinations are blocked')
    }
    const address = addresses[0]!
    const result = await new Promise<WebResponse | { location: string }>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        url,
        {
          method: options.method ?? 'GET',
          agent: false,
          headers: {
            'User-Agent': 'Orchentra/0.9 (+web retrieval)',
            'Accept-Encoding': 'identity',
            ...options.headers,
          },
          // Keep the hostname for Host/SNI, but never perform an unchecked second lookup.
          lookup: (_host, opts, callback) => {
            if (opts.all)
              (callback as unknown as (error: null, records: Array<{ address: string; family: number }>) => void)(
                null,
                [address],
              )
            else callback(null, address.address, address.family)
          },
        },
        (response) => {
          const status = response.statusCode ?? 0
          if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
            response.destroy()
            if (options.method === 'POST') {
              reject(new WebError('invalid_response', 'Search endpoint redirected'))
              return
            }
            resolve({ location: response.headers.location })
            return
          }
          const length = Number(response.headers['content-length'] ?? 0)
          if (length > maxBytes) {
            response.destroy()
            reject(new WebError('too_large', `Response exceeds ${maxBytes} bytes`))
            return
          }
          const encoding = response.headers['content-encoding']?.toLowerCase()
          const decoder =
            encoding === 'gzip'
              ? createGunzip()
              : encoding === 'br'
                ? createBrotliDecompress()
                : encoding === 'deflate'
                  ? createInflate()
                  : null
          if (encoding && encoding !== 'identity' && !decoder) {
            response.destroy()
            reject(new WebError('unsupported_content', `Unsupported content encoding: ${encoding}`))
            return
          }
          const stream = decoder ? response.pipe(decoder) : response
          if (decoder) {
            let downloaded = 0
            response.on('data', (chunk: Buffer) => {
              downloaded += chunk.length
              if (downloaded > maxBytes) {
                const error = new WebError('too_large', `Download exceeds ${maxBytes} bytes`)
                response.destroy(error)
                decoder.destroy(error)
              }
            })
            response.on('error', (error) => decoder.destroy(error))
          }
          const chunks: Buffer[] = []
          let bytes = 0
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length
            if (bytes > maxBytes) {
              const error = new WebError('too_large', `Response exceeds ${maxBytes} bytes`)
              response.destroy(error)
              stream.destroy(error)
              return
            }
            chunks.push(chunk)
          })
          response.on('error', reject)
          stream.on('error', reject)
          stream.on('end', () =>
            resolve({
              url: url.href,
              status,
              contentType: response.headers['content-type'] ?? '',
              body: Buffer.concat(chunks).toString('utf8'),
              bytes,
            }),
          )
        },
      )
      const cancel = (): void => {
        reject(signal.reason)
        request.destroy()
      }
      signal.addEventListener('abort', cancel, { once: true })
      request.on('close', () => signal.removeEventListener('abort', cancel))
      request.on('error', reject)
      if (signal.aborted) cancel()
      else request.end(options.body)
    })
    if ('location' in result) {
      if (redirects === 5) throw new WebError('invalid_response', 'Too many redirects (maximum 5)')
      const next = parseWebUrl(new URL(result.location, url).href)
      if (url.protocol === 'https:' && next.protocol !== 'https:')
        throw new WebError('blocked_address', 'HTTPS downgrade redirect blocked')
      url = next
      continue
    }
    return result
  }
  throw new WebError('invalid_response', 'Redirect limit exceeded')
}

async function abortableLookup(
  hostname: string,
  signal: AbortSignal,
): Promise<Array<{ address: string; family: number }>> {
  return new Promise((resolve, reject) => {
    const abort = (): void => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    lookup(hostname, { all: true })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
  })
}

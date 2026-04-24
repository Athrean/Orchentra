import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface PkcePair {
  readonly verifier: string
  readonly challenge: string
  readonly method: 'S256'
}

export function generatePkce(): PkcePair {
  const verifier = base64UrlEncode(randomBytes(32))
  const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest())
  return { verifier, challenge, method: 'S256' }
}

export function generateState(): string {
  return base64UrlEncode(randomBytes(16))
}

export interface LoopbackResult {
  readonly code: string
  readonly state: string
  readonly redirectUri: string
}

export interface LoopbackOptions {
  readonly preferredPorts?: readonly number[]
  readonly timeoutMs?: number
  readonly successHtml?: string
  readonly failureHtml?: string
  readonly path?: string
}

export async function captureLoopbackCode(options: LoopbackOptions = {}): Promise<{
  waitForCode(state: string): Promise<LoopbackResult>
  close(): void
  redirectUri: string
}> {
  const path = options.path ?? '/callback'
  const successHtml =
    options.successHtml ??
    '<html><body style="font-family:sans-serif;padding:40px"><h2>✓ Signed in</h2><p>You can close this tab.</p></body></html>'
  const failureHtml =
    options.failureHtml ??
    '<html><body style="font-family:sans-serif;padding:40px"><h2>Sign-in failed</h2><p>Please retry from the terminal.</p></body></html>'

  let resolve!: (r: LoopbackResult) => void
  let reject!: (err: Error) => void
  const waiter = new Promise<LoopbackResult>((res, rej) => {
    resolve = res
    reject = rej
  })

  const server: Server = createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400
      res.end()
      return
    }
    const parsed = new URL(req.url, 'http://localhost')
    if (parsed.pathname !== path) {
      res.statusCode = 404
      res.end()
      return
    }
    const error = parsed.searchParams.get('error')
    const code = parsed.searchParams.get('code')
    const state = parsed.searchParams.get('state')
    if (error) {
      res.writeHead(400, { 'content-type': 'text/html' })
      res.end(failureHtml)
      reject(new Error(`oauth error: ${error} ${parsed.searchParams.get('error_description') ?? ''}`))
      return
    }
    if (!code || !state) {
      res.writeHead(400, { 'content-type': 'text/html' })
      res.end(failureHtml)
      reject(new Error('missing code or state in callback'))
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(successHtml)
    resolve({ code, state, redirectUri: '' })
  })

  const port = await listenOnFirstFreePort(server, options.preferredPorts)
  const redirectUri = `http://127.0.0.1:${port}${path}`

  let timer: ReturnType<typeof setTimeout> | null = null
  if (options.timeoutMs && options.timeoutMs > 0) {
    timer = setTimeout(() => reject(new Error('oauth callback timed out')), options.timeoutMs)
  }

  return {
    redirectUri,
    async waitForCode(expectedState: string): Promise<LoopbackResult> {
      try {
        const result = await waiter
        if (result.state !== expectedState) {
          throw new Error('oauth state mismatch — possible CSRF')
        }
        return { ...result, redirectUri }
      } finally {
        if (timer) clearTimeout(timer)
        server.close()
      }
    },
    close(): void {
      if (timer) clearTimeout(timer)
      server.close()
    },
  }
}

function listenOnFirstFreePort(server: Server, preferred?: readonly number[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const candidates = preferred && preferred.length > 0 ? [...preferred, 0] : [0]
    let index = 0
    const tryNext = () => {
      if (index >= candidates.length) {
        reject(new Error('no free port available for oauth loopback'))
        return
      }
      const port = candidates[index++]
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          tryNext()
        } else {
          reject(err)
        }
      })
      server.listen(port, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo | null
        if (!addr) {
          reject(new Error('failed to read server address'))
          return
        }
        resolve(addr.port)
      })
    }
    tryNext()
  })
}

export function buildAuthorizeUrl(
  authorizeUrl: string,
  params: Record<string, string>,
): string {
  const url = new URL(authorizeUrl)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return url.toString()
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

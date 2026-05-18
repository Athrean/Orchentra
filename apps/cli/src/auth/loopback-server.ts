/**
 * Ephemeral loopback HTTP receiver for the CLI bootstrap callback.
 *
 * The Orchentra server, after minting an apiKey on the install/configure
 * callback, redirects the user's browser to this listener with the install
 * payload in the query string. This module binds 127.0.0.1 on a random port
 * in the IANA dynamic range, accepts a single `GET /install-cb`, and resolves
 * a promise with the payload.
 *
 * Lifetime: one bootstrap attempt. The caller is expected to `stop()` after
 * `waitForCallback()` resolves or rejects. The server returns 404 for any
 * other path so a stray request does not consume the slot.
 */

type BunServer = ReturnType<typeof Bun.serve>

export interface InstallCallbackPayload {
  readonly orgId?: string
  readonly installationId?: number
  readonly apiKey?: string
  readonly error?: string
}

export interface LoopbackServer {
  readonly port: number
  waitForCallback(): Promise<InstallCallbackPayload>
  stop(): void
}

export interface StartLoopbackOptions {
  readonly timeoutMs: number
  readonly host?: string
}

const PORT_MIN = 49152
const PORT_MAX = 65535
const BIND_RETRIES = 5

function pickPort(): number {
  return PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN + 1))
}

function parsePayload(url: URL): InstallCallbackPayload {
  const orgId = url.searchParams.get('orgId') ?? undefined
  const installationIdStr = url.searchParams.get('installationId')
  const apiKey = url.searchParams.get('apiKey') ?? undefined
  const error = url.searchParams.get('error') ?? undefined
  let installationId: number | undefined
  if (installationIdStr) {
    const n = Number(installationIdStr)
    if (Number.isInteger(n) && n > 0) installationId = n
  }
  return { orgId, installationId, apiKey, error }
}

const SUCCESS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Orchentra</title>
<style>body{font-family:system-ui;background:#0f1115;color:#e6e6e6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}main{text-align:center;max-width:32rem;padding:2rem}h1{font-weight:600;margin-bottom:0.5rem}p{color:#a6adba;margin:0}</style>
</head><body><main><h1>Bootstrapped</h1><p>You can close this tab and return to your terminal.</p></main></body></html>`

export async function startLoopback(opts: StartLoopbackOptions): Promise<LoopbackServer> {
  const host = opts.host ?? '127.0.0.1'

  let resolveWait: ((p: InstallCallbackPayload) => void) | null = null
  let rejectWait: ((e: Error) => void) | null = null
  let settled = false

  const waitPromise = new Promise<InstallCallbackPayload>((resolve, reject) => {
    resolveWait = resolve
    rejectWait = reject
  })
  // Swallow unhandled rejections — callers that never call waitForCallback
  // should not be charged for the timeout/stop rejection.
  waitPromise.catch(() => undefined)

  let server: BunServer | null = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < BIND_RETRIES; attempt++) {
    const port = pickPort()
    try {
      server = Bun.serve({
        port,
        hostname: host,
        fetch(req): Response {
          const url = new URL(req.url)
          if (url.pathname !== '/install-cb' || req.method !== 'GET') {
            return new Response('not found', { status: 404 })
          }
          if (!settled && resolveWait) {
            settled = true
            resolveWait(parsePayload(url))
          }
          return new Response(SUCCESS_HTML, {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        },
      })
      break
    } catch (err) {
      lastError = err
      server = null
    }
  }
  if (!server) {
    throw new Error(`could not bind loopback port after ${BIND_RETRIES} attempts: ${String(lastError)}`)
  }

  const timeout = setTimeout(() => {
    if (!settled && rejectWait) {
      settled = true
      rejectWait(new Error(`loopback timeout after ${opts.timeoutMs}ms`))
    }
  }, opts.timeoutMs)

  const stop = (): void => {
    clearTimeout(timeout)
    if (!settled && rejectWait) {
      settled = true
      rejectWait(new Error('loopback stopped'))
    }
    server!.stop(true)
  }

  const boundPort = server.port
  if (typeof boundPort !== 'number') {
    server.stop(true)
    throw new Error('loopback bound but did not report a numeric port')
  }
  return {
    port: boundPort,
    waitForCallback: () => waitPromise,
    stop,
  }
}

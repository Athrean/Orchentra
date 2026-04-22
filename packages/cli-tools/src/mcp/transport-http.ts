import type { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from './protocol'
import { isJsonRpcResponse } from './protocol'
import type { Transport, TransportStatus } from './transport'
import { SseParser } from './sse'

export interface HttpTransportOptions {
  readonly url: string
  readonly headers: Record<string, string>
}

const ACCEPT_HEADER = 'application/json, text/event-stream'

export class HttpTransport implements Transport {
  private readonly opts: HttpTransportOptions
  private state: TransportStatus['state'] = 'idle'
  private failureReason: string | undefined

  constructor(options: HttpTransportOptions) {
    this.opts = options
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') throw new Error(`HttpTransport: cannot start in state ${this.state}`)
    this.state = 'open'
  }

  async send(request: JsonRpcRequest, timeoutMs: number): Promise<JsonRpcResponse> {
    if (this.state !== 'open') throw new Error(`HttpTransport: cannot send while in state ${this.state}`)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(this.opts.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: ACCEPT_HEADER,
          ...this.opts.headers,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
      if (!response.ok) {
        const text = await safeText(response)
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('text/event-stream')) {
        return await readSseResponse(response, request.id)
      }
      const body = await response.json()
      if (!isJsonRpcResponse(body)) {
        throw new Error(`HTTP response is not a JSON-RPC response: ${JSON.stringify(body).slice(0, 200)}`)
      }
      if (body.id !== request.id) {
        throw new Error(`HTTP JSON-RPC id mismatch (expected ${String(request.id)}, got ${String(body.id)})`)
      }
      return body
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`MCP HTTP request timed out after ${timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    if (this.state !== 'open') throw new Error(`HttpTransport: cannot send while in state ${this.state}`)
    const response = await fetch(this.opts.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: ACCEPT_HEADER,
        ...this.opts.headers,
      },
      body: JSON.stringify(notification),
    })
    if (!response.ok && response.status !== 202) {
      const text = await safeText(response)
      this.failureReason = `notification rejected: HTTP ${response.status}: ${text.slice(0, 120)}`
    }
    try {
      await response.body?.cancel()
    } catch {
      /* ignore */
    }
  }

  async close(): Promise<void> {
    this.state = 'closed'
  }

  status(): TransportStatus {
    return { state: this.state, failureReason: this.failureReason }
  }
}

async function readSseResponse(response: Response, requestId: JsonRpcRequest['id']): Promise<JsonRpcResponse> {
  const body = response.body
  if (!body) throw new Error('SSE response has no body')
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = new SseParser()
  let running = true
  try {
    while (running) {
      const { done, value } = await reader.read()
      if (done) {
        running = false
        break
      }
      if (!value) continue
      const chunk = decoder.decode(value, { stream: true })
      for (const event of parser.push(chunk)) {
        if (event.data.length === 0) continue
        let parsed: unknown
        try {
          parsed = JSON.parse(event.data)
        } catch {
          continue
        }
        if (isJsonRpcResponse(parsed) && parsed.id === requestId) {
          return parsed
        }
      }
    }
  } finally {
    reader.releaseLock()
    try {
      await body.cancel()
    } catch {
      /* ignore */
    }
  }
  throw new Error('SSE stream ended before matching response arrived')
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

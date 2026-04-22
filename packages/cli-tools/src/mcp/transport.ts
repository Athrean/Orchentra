import type { JsonRpcId, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from './protocol'

export interface TransportStatus {
  readonly state: 'idle' | 'starting' | 'open' | 'closing' | 'closed' | 'failed'
  readonly failureReason?: string
  readonly stderrTail?: string
}

export interface Transport {
  start(): Promise<void>
  send(request: JsonRpcRequest, timeoutMs: number): Promise<JsonRpcResponse>
  sendNotification(notification: JsonRpcNotification): Promise<void>
  close(): Promise<void>
  status(): TransportStatus
}

export class RingBuffer {
  private chunks: string[] = []
  private totalSize = 0

  constructor(private readonly maxBytes: number) {}

  push(chunk: string): void {
    this.chunks.push(chunk)
    this.totalSize += chunk.length
    while (this.totalSize > this.maxBytes && this.chunks.length > 0) {
      const removed = this.chunks.shift()
      if (removed !== undefined) this.totalSize -= removed.length
    }
  }

  toString(): string {
    return this.chunks.join('')
  }
}

export class LineBuffer {
  private pending = ''

  push(chunk: string): string[] {
    this.pending += chunk
    const lines: string[] = []
    let idx = this.pending.indexOf('\n')
    while (idx !== -1) {
      const line = this.pending.slice(0, idx).replace(/\r$/, '')
      if (line.length > 0) lines.push(line)
      this.pending = this.pending.slice(idx + 1)
      idx = this.pending.indexOf('\n')
    }
    return lines
  }

  flush(): string | null {
    if (this.pending.length === 0) return null
    const remaining = this.pending
    this.pending = ''
    return remaining
  }
}

interface PendingRequest {
  resolve: (value: JsonRpcResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export function matchResponseId(message: unknown, id: JsonRpcId): boolean {
  if (typeof message !== 'object' || message === null) return false
  const asRecord = message as Record<string, unknown>
  return asRecord.id === id
}

export class RequestDispatcher {
  private pending = new Map<JsonRpcId, PendingRequest>()

  register(id: JsonRpcId, timeoutMs: number, onTimeout: () => void): Promise<JsonRpcResponse> {
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        onTimeout()
        reject(new Error(`MCP request ${String(id)} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
    })
  }

  dispatch(response: JsonRpcResponse): boolean {
    const entry = this.pending.get(response.id)
    if (!entry) return false
    clearTimeout(entry.timer)
    this.pending.delete(response.id)
    entry.resolve(response)
    return true
  }

  rejectAll(error: Error): void {
    for (const entry of Array.from(this.pending.values())) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    this.pending.clear()
  }

  size(): number {
    return this.pending.size
  }
}

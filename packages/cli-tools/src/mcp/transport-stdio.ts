import type { Subprocess } from 'bun'
import type { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from './protocol'
import { isJsonRpcResponse } from './protocol'
import type { Transport, TransportStatus } from './transport'
import { LineBuffer, RequestDispatcher, RingBuffer } from './transport'

type StdioProc = Subprocess<'pipe', 'pipe', 'pipe'>

export interface StdioTransportOptions {
  readonly command: string
  readonly args: string[]
  readonly env: Record<string, string>
  readonly cwd?: string
  readonly stderrCapacityBytes?: number
  readonly shutdownGraceMs?: number
}

const DEFAULT_STDERR_CAPACITY = 64 * 1024
const DEFAULT_SHUTDOWN_GRACE_MS = 2_000

export class StdioTransport implements Transport {
  private readonly opts: Required<StdioTransportOptions>
  private readonly dispatcher = new RequestDispatcher()
  private readonly stdoutBuffer = new LineBuffer()
  private readonly stderrRing: RingBuffer
  private state: TransportStatus['state'] = 'idle'
  private failureReason: string | undefined
  private proc: StdioProc | null = null
  private readLoop: Promise<void> | null = null

  constructor(options: StdioTransportOptions) {
    this.opts = {
      command: options.command,
      args: options.args,
      env: options.env,
      cwd: options.cwd ?? process.cwd(),
      stderrCapacityBytes: options.stderrCapacityBytes ?? DEFAULT_STDERR_CAPACITY,
      shutdownGraceMs: options.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS,
    }
    this.stderrRing = new RingBuffer(this.opts.stderrCapacityBytes)
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') throw new Error(`StdioTransport: cannot start in state ${this.state}`)
    this.state = 'starting'
    try {
      this.proc = Bun.spawn({
        cmd: [this.opts.command, ...this.opts.args],
        cwd: this.opts.cwd,
        env: { ...process.env, ...this.opts.env },
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      }) as StdioProc
    } catch (err) {
      this.state = 'failed'
      this.failureReason = err instanceof Error ? err.message : String(err)
      throw err
    }
    this.state = 'open'
    this.readLoop = this.runReadLoop()
    this.runStderrLoop()
  }

  async send(request: JsonRpcRequest, timeoutMs: number): Promise<JsonRpcResponse> {
    this.ensureOpen()
    const pending = this.dispatcher.register(request.id, timeoutMs, () => {})
    await this.writeLine(JSON.stringify(request))
    return pending
  }

  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    this.ensureOpen()
    await this.writeLine(JSON.stringify(notification))
  }

  async close(): Promise<void> {
    if (this.state === 'closed' || this.state === 'idle') return
    this.state = 'closing'
    this.dispatcher.rejectAll(new Error('StdioTransport closed'))
    const proc = this.proc
    if (!proc) {
      this.state = 'closed'
      return
    }
    try {
      proc.stdin.end()
    } catch {
      /* ignore */
    }
    const closed = Promise.race([
      proc.exited,
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), this.opts.shutdownGraceMs)),
    ])
    const result = await closed
    if (result === 'timeout') {
      proc.kill('SIGTERM')
      const afterTerm = await Promise.race([
        proc.exited,
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), this.opts.shutdownGraceMs)),
      ])
      if (afterTerm === 'timeout') proc.kill('SIGKILL')
      await proc.exited
    }
    this.state = 'closed'
    if (this.readLoop) await this.readLoop.catch(() => {})
  }

  status(): TransportStatus {
    return {
      state: this.state,
      failureReason: this.failureReason,
      stderrTail: this.stderrRing.toString() || undefined,
    }
  }

  private async writeLine(line: string): Promise<void> {
    const proc = this.proc
    if (!proc) throw new Error('StdioTransport: stdin unavailable')
    const stdin = proc.stdin
    stdin.write(line + '\n')
    await stdin.flush()
  }

  private async runReadLoop(): Promise<void> {
    const proc = this.proc
    if (!proc) return
    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    let running = true
    try {
      while (running) {
        const { done, value } = await reader.read()
        if (done) {
          running = false
          break
        }
        if (!value) continue
        const text = decoder.decode(value, { stream: true })
        for (const line of this.stdoutBuffer.push(text)) {
          this.handleLine(line)
        }
      }
    } catch (err) {
      this.failureReason = err instanceof Error ? err.message : String(err)
    } finally {
      reader.releaseLock()
      const remainder = this.stdoutBuffer.flush()
      if (remainder) this.handleLine(remainder)
      if (this.state === 'open') {
        this.state = 'failed'
        this.failureReason = this.failureReason ?? 'subprocess stdout ended unexpectedly'
        this.dispatcher.rejectAll(new Error(this.failureReason))
      }
    }
  }

  private async runStderrLoop(): Promise<void> {
    const proc = this.proc
    if (!proc) return
    const reader = proc.stderr.getReader()
    const decoder = new TextDecoder()
    let running = true
    try {
      while (running) {
        const { done, value } = await reader.read()
        if (done) {
          running = false
          break
        }
        if (value) this.stderrRing.push(decoder.decode(value, { stream: true }))
      }
    } catch {
      /* ignore */
    } finally {
      reader.releaseLock()
    }
  }

  private handleLine(line: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return
    }
    if (isJsonRpcResponse(parsed)) {
      this.dispatcher.dispatch(parsed)
    }
  }

  private ensureOpen(): void {
    if (this.state !== 'open') {
      throw new Error(`StdioTransport: cannot send while in state ${this.state}`)
    }
  }
}

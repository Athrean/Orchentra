import { performance } from 'node:perf_hooks'
import type { ToolResourceClass } from './tools'

export interface ProgramSchedulePolicy {
  readonly parallelSafe: boolean
  readonly resourceClass: ToolResourceClass
}

export interface ProgramSchedulerSnapshot {
  readonly submitted: number
  readonly parallelSubmitted: number
  readonly serialSubmitted: number
  readonly peakRunning: number
  readonly queueWaitMs: number
}

/**
 * Barrier scheduler for QuickJS host capabilities. Consecutive safe calls may
 * overlap; every serial call waits for all earlier work and becomes a barrier
 * for all later work. A rejected task never poisons the ordering chain.
 */
export class ProgramOperationScheduler {
  private readonly maxConcurrent: number
  private readonly now: () => number
  private serialTail: Promise<void> = Promise.resolve()
  private readonly parallelTasks = new Set<Promise<void>>()
  private readonly slotWaiters: Array<() => void> = []
  private occupiedSlots = 0
  private running = 0
  private closed = false
  private submitted = 0
  private parallelSubmitted = 0
  private serialSubmitted = 0
  private peakRunning = 0
  private queueWaitMs = 0

  constructor(options: { maxConcurrent?: number; now?: () => number } = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 4
    this.now = options.now ?? (() => performance.now())
    if (!Number.isInteger(this.maxConcurrent) || this.maxConcurrent < 1) {
      throw new Error('program scheduler maxConcurrent must be a positive integer')
    }
  }

  schedule<T>(policy: ProgramSchedulePolicy, task: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('program scheduler is closed'))
    this.submitted++
    const submittedAt = this.now()
    if (policy.parallelSafe) {
      this.parallelSubmitted++
      const barrier = this.serialTail
      const promise = (async () => {
        await barrier
        await this.acquireSlot()
        this.queueWaitMs += Math.max(0, this.now() - submittedAt)
        this.beginRunning()
        try {
          return await task()
        } finally {
          this.endRunning()
          this.releaseSlot()
        }
      })()
      const settled = promise.then(
        () => {},
        () => {},
      )
      this.parallelTasks.add(settled)
      void settled.finally(() => this.parallelTasks.delete(settled))
      return promise
    }

    this.serialSubmitted++
    const predecessors = [this.serialTail, ...Array.from(this.parallelTasks)]
    const promise = Promise.allSettled(predecessors).then(async () => {
      this.queueWaitMs += Math.max(0, this.now() - submittedAt)
      this.beginRunning()
      try {
        return await task()
      } finally {
        this.endRunning()
      }
    })
    this.serialTail = promise.then(
      () => {},
      () => {},
    )
    return promise
  }

  async close(): Promise<void> {
    this.closed = true
    await Promise.allSettled([this.serialTail, ...Array.from(this.parallelTasks)])
  }

  snapshot(): ProgramSchedulerSnapshot {
    return {
      submitted: this.submitted,
      parallelSubmitted: this.parallelSubmitted,
      serialSubmitted: this.serialSubmitted,
      peakRunning: this.peakRunning,
      queueWaitMs: this.queueWaitMs,
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.occupiedSlots < this.maxConcurrent) {
      this.occupiedSlots++
      return
    }
    await new Promise<void>((resolve) => this.slotWaiters.push(resolve))
  }

  private releaseSlot(): void {
    const next = this.slotWaiters.shift()
    if (next) next()
    else this.occupiedSlots--
  }

  private beginRunning(): void {
    this.running++
    this.peakRunning = Math.max(this.peakRunning, this.running)
  }

  private endRunning(): void {
    this.running--
  }
}

import { computeBackoff, type RetryConfig } from '@orchentra/cli-api'

export interface PooledResult<T> {
  value: T
  requeues: number
}

export interface SubagentPoolOptions<T> {
  limit: number
  run: (task: string) => Promise<T>
  // A value this returns true for is requeued (to the back of the queue, with
  // backoff) instead of recorded, until the per-task requeue cap is hit.
  shouldRequeue?: (value: T) => boolean
  sleep?: (ms: number) => Promise<void>
}

// One extra run after each of 2 requeues, then the last value stands.
const MAX_REQUEUES = 2

// Deliberately short: per-request exponential backoff already lives inside the
// provider clients, so by the time a rate-limit surfaces here those waits are
// spent. Requeued tasks go to the back of the queue, so with other tasks
// pending the queue position itself is the spacing; this delay only guards the
// nothing-else-pending case.
const REQUEUE_BACKOFF: RetryConfig = { maxRetries: MAX_REQUEUES, initialMs: 300, maxMs: 5000 }

interface Job {
  index: number
  attempt: number
  eligibleAt: number
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Runs at most `limit` tasks concurrently, preserving result order by index
// (each job carries its slot and writes back to it, regardless of when other
// workers finish) so callers don't need to re-sort. Requeued jobs join the
// back of the FIFO queue, so the rest of the batch proceeds while a flagged
// task waits out its backoff.
export async function runSubagentPool<T>(
  tasks: string[],
  opts: SubagentPoolOptions<T>,
): Promise<Array<PooledResult<T>>> {
  const sleep = opts.sleep ?? realSleep
  const results = new Array<PooledResult<T>>(tasks.length)
  const queue: Job[] = tasks.map((_, index) => ({ index, attempt: 0, eligibleAt: 0 }))

  async function worker(): Promise<void> {
    // A worker that requeues a job keeps looping, so every queued job always
    // has a live worker even after its siblings drain the queue and exit.
    while (queue.length > 0) {
      const job = queue.shift()!
      const wait = job.eligibleAt - Date.now()
      if (wait > 0) await sleep(wait)
      const value = await opts.run(tasks[job.index]!)
      if (opts.shouldRequeue?.(value) && job.attempt < MAX_REQUEUES) {
        const attempt = job.attempt + 1
        queue.push({ index: job.index, attempt, eligibleAt: Date.now() + computeBackoff(attempt, REQUEUE_BACKOFF) })
        continue
      }
      results[job.index] = { value, requeues: job.attempt }
    }
  }

  await Promise.all(Array.from({ length: Math.min(opts.limit, tasks.length) }, worker))
  return results
}

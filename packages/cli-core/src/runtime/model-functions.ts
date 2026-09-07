import { randomUUID } from 'node:crypto'
import type { DoneReason, ToolArtifact, ToolEvidence, UsageTotals } from './events'
import { emptyUsage } from './events'
import type { ImageContent } from './image'

export type ModelFunctionKind = 'leaf' | 'recursive'
export type ModelJobStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out'

export interface ModelFunctionRequestOptions {
  readonly model?: string
  readonly maxOutputTokens?: number
  readonly maxTokens?: number
  readonly maxSteps?: number
  readonly timeoutMs?: number
}

export interface NormalizedModelFunctionOptions {
  readonly model: string
  readonly maxOutputTokens: number
  readonly maxTokens: number
  readonly maxSteps: number
  readonly timeoutMs: number
}

export interface ModelFunctionLimits {
  readonly maxDepth: number
  readonly maxConcurrent: number
  readonly maxInputChars: number
  readonly maxOutputTokens: number
  readonly maxTokens: number
  readonly maxSteps: number
  readonly maxTimeoutMs: number
}

export const DEFAULT_MODEL_FUNCTION_LIMITS: ModelFunctionLimits = {
  maxDepth: 2,
  maxConcurrent: 4,
  maxInputChars: 32_000,
  maxOutputTokens: 4_096,
  maxTokens: 200_000,
  maxSteps: 20,
  maxTimeoutMs: 90_000,
}

export interface ModelJobSnapshot {
  readonly jobId: string
  readonly callKind: ModelFunctionKind
  readonly status: ModelJobStatus
  readonly model: string
  readonly depth: number
  readonly attempt: number
  readonly startedAt: string
  readonly endedAt?: string
  readonly doneReason?: string
  readonly contextHandle?: string
  readonly traceId?: string
  readonly usage?: UsageTotals
}

/** Host-only result. The QuickJS bridge sanitizes images before crossing into the guest. */
export interface ModelJobResult extends ModelJobSnapshot {
  readonly text: string
  readonly isError: boolean
  readonly images?: readonly ImageContent[]
  readonly evidence?: readonly ToolEvidence[]
  readonly artifacts?: readonly ToolArtifact[]
}

export interface ModelFunctionOutcome {
  readonly model: string
  readonly text: string
  readonly isError: boolean
  readonly doneReason?: DoneReason | string
  readonly usage: UsageTotals
  readonly traceId?: string
  readonly images?: readonly ImageContent[]
  readonly evidence?: readonly ToolEvidence[]
  readonly artifacts?: readonly ToolArtifact[]
  /** Opaque host state used only for a same-run recursive resume. */
  readonly resumeState?: unknown
}

export interface ModelJobRunRequest {
  readonly jobId: string
  readonly callKind: ModelFunctionKind
  readonly input: string
  readonly options: NormalizedModelFunctionOptions
  readonly depth: number
  readonly attempt: number
  readonly signal: AbortSignal
  readonly resumeState?: unknown
  abort(reason: string): void
  registerMessenger(send: (message: string) => void): void
}

export interface ModelFunctionHost {
  query(kind: ModelFunctionKind, input: unknown, options?: unknown): Promise<ModelJobResult>
  start(kind: ModelFunctionKind, input: unknown, options?: unknown): Promise<ModelJobSnapshot>
  status(jobId?: unknown): readonly ModelJobSnapshot[] | ModelJobSnapshot
  wait(jobId: unknown): Promise<ModelJobResult>
  cancel(jobId: unknown): Promise<ModelJobSnapshot>
  send(jobId: unknown, message: unknown): Promise<{ readonly job: ModelJobSnapshot; readonly queued: boolean }>
  resume(jobId: unknown, message?: unknown): Promise<ModelJobSnapshot>
  close(): Promise<void>
}

export interface ModelJobManagerOptions {
  readonly model: string
  readonly depth: number
  readonly limits?: Partial<ModelFunctionLimits>
  readonly signal?: AbortSignal
  /** Runtime-owned shared-budget check performed before a provider job exists. */
  readonly beforeStart?: () => void
  readonly run: (request: ModelJobRunRequest) => Promise<ModelFunctionOutcome>
  readonly storeResult: (result: ModelFunctionOutcome, job: ModelJobSnapshot) => Promise<string | undefined>
  readonly onJob?: (job: ModelJobSnapshot) => void | Promise<void>
  readonly idGen?: () => string
  readonly clock?: () => string
}

interface ModelJob {
  readonly id: string
  readonly callKind: ModelFunctionKind
  input: string
  readonly options: NormalizedModelFunctionOptions
  readonly depth: number
  attempt: number
  status: ModelJobStatus
  startedAt: string
  endedAt?: string
  doneReason?: string
  controller: AbortController
  promise: Promise<ModelJobResult> | null
  result?: ModelJobResult
  resumeState?: unknown
  messenger?: (message: string) => void
  pendingMessages: string[]
  stopReason?: string
}

export class ModelFunctionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelFunctionError'
  }
}

/**
 * Run-scoped lifecycle and admission control for RLM leaf/recursive calls.
 * Providers and child runtimes are injected by ConversationRuntime; this
 * class never receives either authority directly.
 */
export class ModelJobManager implements ModelFunctionHost {
  private readonly limits: ModelFunctionLimits
  private readonly jobs = new Map<string, ModelJob>()
  private closed = false

  constructor(private readonly options: ModelJobManagerOptions) {
    // An unset config field arrives as an explicit `undefined` (the loader
    // returns `{maxDepth: undefined}` when the user configured nothing), and a
    // plain spread would overwrite the default with it — dropping those keys
    // keeps "not configured" meaning "use the default".
    this.limits = { ...DEFAULT_MODEL_FUNCTION_LIMITS, ...definedOnly(options.limits) }
    validateLimits(this.limits)
  }

  async query(kind: ModelFunctionKind, input: unknown, options?: unknown): Promise<ModelJobResult> {
    const job = await this.create(kind, input, options)
    return this.wait(job.jobId)
  }

  async start(kind: ModelFunctionKind, input: unknown, options?: unknown): Promise<ModelJobSnapshot> {
    return this.create(kind, input, options)
  }

  status(jobId?: unknown): readonly ModelJobSnapshot[] | ModelJobSnapshot {
    this.assertOpen()
    if (jobId === undefined) return Array.from(this.jobs.values(), (job) => snapshot(job))
    return snapshot(this.requireJob(jobId))
  }

  async wait(jobId: unknown): Promise<ModelJobResult> {
    this.assertOpen()
    const job = this.requireJob(jobId)
    if (job.result) return job.result
    if (!job.promise) throw new ModelFunctionError(`Model job ${job.id} has no active attempt.`)
    return job.promise
  }

  async cancel(jobId: unknown): Promise<ModelJobSnapshot> {
    this.assertOpen()
    const job = this.requireJob(jobId)
    if (job.status !== 'running') return snapshot(job)
    this.abort(job, 'cancelled')
    await job.promise
    return snapshot(job)
  }

  async send(jobId: unknown, message: unknown): Promise<{ readonly job: ModelJobSnapshot; readonly queued: boolean }> {
    this.assertOpen()
    const job = this.requireJob(jobId)
    if (job.callKind !== 'recursive') throw new ModelFunctionError('jobs.send is available only for recursive jobs.')
    if (job.status !== 'running') throw new ModelFunctionError(`Model job ${job.id} is ${job.status}, not running.`)
    const content = requiredText(message, 'message', this.limits.maxInputChars)
    if (job.messenger) {
      job.messenger(content)
      return { job: snapshot(job), queued: false }
    }
    job.pendingMessages.push(content)
    return { job: snapshot(job), queued: true }
  }

  async resume(jobId: unknown, message?: unknown): Promise<ModelJobSnapshot> {
    this.assertOpen()
    const job = this.requireJob(jobId)
    if (job.callKind !== 'recursive') throw new ModelFunctionError('Only recursive model jobs can be resumed.')
    if (job.status === 'running') throw new ModelFunctionError(`Model job ${job.id} is already running.`)
    if (job.resumeState === undefined) throw new ModelFunctionError(`Model job ${job.id} has no resumable state.`)
    this.assertAdmission(job.callKind)
    this.options.beforeStart?.()
    job.input =
      message === undefined
        ? 'Continue from the retained checkpoint without repeating completed work.'
        : requiredText(message, 'message', this.limits.maxInputChars)
    job.attempt++
    job.status = 'running'
    job.startedAt = this.now()
    job.endedAt = undefined
    job.doneReason = undefined
    job.stopReason = undefined
    job.result = undefined
    job.messenger = undefined
    job.pendingMessages = []
    job.controller = new AbortController()
    await this.notify(job)
    this.launch(job, job.resumeState)
    return snapshot(job)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const running = Array.from(this.jobs.values()).filter((job) => job.status === 'running')
    for (const job of running) this.abort(job, 'parent_closed')
    await Promise.allSettled(running.map((job) => job.promise))
  }

  private async create(kind: ModelFunctionKind, rawInput: unknown, rawOptions: unknown): Promise<ModelJobSnapshot> {
    this.assertOpen()
    this.assertKind(kind)
    this.assertAdmission(kind)
    this.options.beforeStart?.()
    const input = requiredText(rawInput, 'input', this.limits.maxInputChars)
    const options = normalizeOptions(kind, rawOptions, this.options.model, this.limits)
    const job: ModelJob = {
      id: `model-job-${this.options.idGen?.() ?? randomUUID()}`,
      callKind: kind,
      input,
      options,
      depth: kind === 'recursive' ? this.options.depth + 1 : this.options.depth,
      attempt: 1,
      status: 'running',
      startedAt: this.now(),
      controller: new AbortController(),
      promise: null,
      pendingMessages: [],
    }
    this.jobs.set(job.id, job)
    await this.notify(job)
    this.launch(job)
    return snapshot(job)
  }

  private launch(job: ModelJob, resumeState?: unknown): void {
    const onParentAbort = (): void => this.abort(job, 'parent_aborted')
    if (this.options.signal?.aborted) onParentAbort()
    else this.options.signal?.addEventListener('abort', onParentAbort, { once: true })
    const timer = setTimeout(() => this.abort(job, 'timeout'), job.options.timeoutMs)

    job.promise = (async () => {
      let outcome: ModelFunctionOutcome
      try {
        outcome = await this.options.run({
          jobId: job.id,
          callKind: job.callKind,
          input: job.input,
          options: job.options,
          depth: job.depth,
          attempt: job.attempt,
          signal: job.controller.signal,
          resumeState,
          abort: (reason) => this.abort(job, reason),
          registerMessenger: (send) => {
            job.messenger = send
            for (const message of job.pendingMessages.splice(0)) send(message)
          },
        })
      } catch (error) {
        outcome = {
          model: job.options.model,
          text: error instanceof Error ? error.message : String(error),
          isError: true,
          doneReason: 'error',
          usage: emptyUsage(),
        }
      } finally {
        clearTimeout(timer)
        this.options.signal?.removeEventListener('abort', onParentAbort)
      }

      job.resumeState = outcome.resumeState
      job.endedAt = this.now()
      job.doneReason = job.stopReason ?? outcome.doneReason
      job.status =
        job.stopReason === 'timeout'
          ? 'timed_out'
          : job.stopReason !== undefined || job.controller.signal.aborted
            ? 'cancelled'
            : outcome.isError
              ? 'failed'
              : 'completed'

      const base = snapshot(job)
      let contextHandle: string | undefined
      try {
        contextHandle = await this.options.storeResult(outcome, base)
      } catch {
        // Context quota/persistence failure cannot erase a completed provider
        // result; the bounded inline copy remains available to the guest.
      }
      const result: ModelJobResult = {
        ...snapshot(job),
        ...(contextHandle ? { contextHandle } : {}),
        ...(outcome.traceId ? { traceId: outcome.traceId } : {}),
        usage: outcome.usage,
        text: outcome.text,
        isError: job.status !== 'completed' || outcome.isError,
        ...(outcome.images ? { images: outcome.images } : {}),
        ...(outcome.evidence ? { evidence: outcome.evidence } : {}),
        ...(outcome.artifacts ? { artifacts: outcome.artifacts } : {}),
      }
      job.result = result
      if (contextHandle) {
        // Re-snapshot after the result handle is known.
        Object.assign(job, { result })
      }
      await this.options.onJob?.(resultSnapshot(result))
      return result
    })()
  }

  private abort(job: ModelJob, reason: string): void {
    if (job.status !== 'running' || job.controller.signal.aborted) return
    job.stopReason = reason
    job.controller.abort()
  }

  private assertAdmission(kind: ModelFunctionKind): void {
    if (kind === 'recursive' && this.options.depth >= this.limits.maxDepth) {
      throw new ModelFunctionError(`Recursive model depth cap reached (${this.limits.maxDepth}).`)
    }
    const active = Array.from(this.jobs.values()).filter((job) => job.status === 'running').length
    if (active >= this.limits.maxConcurrent) {
      throw new ModelFunctionError(`Concurrent model-job cap reached (${this.limits.maxConcurrent}).`)
    }
  }

  private assertKind(kind: ModelFunctionKind): void {
    if (kind !== 'leaf' && kind !== 'recursive') throw new ModelFunctionError(`Unknown model function: ${String(kind)}`)
  }

  private requireJob(rawId: unknown): ModelJob {
    const id = requiredText(rawId, 'jobId', 256)
    const job = this.jobs.get(id)
    if (!job) throw new ModelFunctionError(`Unknown model job: ${id}`)
    return job
  }

  private assertOpen(): void {
    if (this.closed) throw new ModelFunctionError('Model-job manager is closed.')
  }

  private async notify(job: ModelJob): Promise<void> {
    await this.options.onJob?.(snapshot(job))
  }

  private now(): string {
    return this.options.clock?.() ?? new Date().toISOString()
  }
}

function snapshot(job: ModelJob): ModelJobSnapshot {
  const result = job.result
  return {
    jobId: job.id,
    callKind: job.callKind,
    status: job.status,
    model: job.options.model,
    depth: job.depth,
    attempt: job.attempt,
    startedAt: job.startedAt,
    ...(job.endedAt ? { endedAt: job.endedAt } : {}),
    ...(job.doneReason ? { doneReason: job.doneReason } : {}),
    ...(result?.contextHandle ? { contextHandle: result.contextHandle } : {}),
    ...(result?.traceId ? { traceId: result.traceId } : {}),
    ...(result?.usage ? { usage: result.usage } : {}),
  }
}

function resultSnapshot(result: ModelJobResult): ModelJobSnapshot {
  return {
    jobId: result.jobId,
    callKind: result.callKind,
    status: result.status,
    model: result.model,
    depth: result.depth,
    attempt: result.attempt,
    startedAt: result.startedAt,
    ...(result.endedAt ? { endedAt: result.endedAt } : {}),
    ...(result.doneReason ? { doneReason: result.doneReason } : {}),
    ...(result.contextHandle ? { contextHandle: result.contextHandle } : {}),
    ...(result.traceId ? { traceId: result.traceId } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
  }
}

function normalizeOptions(
  kind: ModelFunctionKind,
  raw: unknown,
  currentModel: string,
  limits: ModelFunctionLimits,
): NormalizedModelFunctionOptions {
  if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw))) {
    throw new ModelFunctionError('Model function options must be an object when provided.')
  }
  const options = (raw ?? {}) as Record<string, unknown>
  const allowed = new Set(['model', 'maxOutputTokens', 'maxTokens', 'maxSteps', 'timeoutMs'])
  const unknown = Object.keys(options).filter((key) => !allowed.has(key))
  if (unknown.length > 0) throw new ModelFunctionError(`Unknown model function option(s): ${unknown.join(', ')}.`)

  const model = options.model === undefined ? currentModel : requiredText(options.model, 'model', 256)
  const defaults =
    kind === 'leaf'
      ? { maxOutputTokens: 1_024, maxTokens: 32_000, maxSteps: 1, timeoutMs: 30_000 }
      : { maxOutputTokens: 4_096, maxTokens: 100_000, maxSteps: 10, timeoutMs: 90_000 }
  return {
    model,
    maxOutputTokens: boundedInteger(
      options.maxOutputTokens,
      'maxOutputTokens',
      defaults.maxOutputTokens,
      1,
      limits.maxOutputTokens,
    ),
    maxTokens: boundedInteger(options.maxTokens, 'maxTokens', defaults.maxTokens, 1, limits.maxTokens),
    maxSteps: boundedInteger(options.maxSteps, 'maxSteps', defaults.maxSteps, 1, limits.maxSteps),
    timeoutMs: boundedInteger(options.timeoutMs, 'timeoutMs', defaults.timeoutMs, 1, limits.maxTimeoutMs),
  }
}

function boundedInteger(raw: unknown, name: string, fallback: number, min: number, max: number): number {
  if (raw === undefined) return fallback
  if (!Number.isInteger(raw) || (raw as number) < min || (raw as number) > max) {
    throw new ModelFunctionError(`${name} must be an integer between ${min} and ${max}.`)
  }
  return raw as number
}

function requiredText(raw: unknown, name: string, maxChars: number): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new ModelFunctionError(`${name} must be a non-empty string.`)
  if (raw.length > maxChars) throw new ModelFunctionError(`${name} exceeds the ${maxChars}-character cap.`)
  return raw
}

function definedOnly(limits: Partial<ModelFunctionLimits> | undefined): Partial<ModelFunctionLimits> {
  if (!limits) return {}
  return Object.fromEntries(Object.entries(limits).filter(([, value]) => value !== undefined))
}

function validateLimits(limits: ModelFunctionLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1)
      throw new ModelFunctionError(`Model function limit ${name} must be positive.`)
  }
}

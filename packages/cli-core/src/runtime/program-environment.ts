import {
  DefaultIntrinsics,
  newQuickJSWASMModule,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
} from 'quickjs-emscripten'
import { performance } from 'node:perf_hooks'
import type { ContextDescriptor, ContextReadResult, RunContextStore } from './context-store'
import { decodedByteLength } from './image'
import type { ProviderToolSchema } from './provider'
import type { ToolArtifact, ToolEvidence, ToolResultPayload } from './events'
import type { ModelFunctionHost, ModelJobResult } from './model-functions'
import {
  ProgramOperationScheduler,
  type ProgramSchedulePolicy,
  type ProgramSchedulerSnapshot,
} from './program-scheduler'
import { DEFAULT_TOOL_SCHEDULING, isParallelSafe, normalizeToolScheduling, type ToolSchedulingMetadata } from './tools'
import {
  PROGRAM_CAPABILITY_CONTRACTS,
  type ProgramCapabilityContract,
  type ProgramOperationKind,
} from './program-capabilities'

export interface ProgramEnvironmentLimits {
  readonly maxCodeChars: number
  readonly maxResultChars: number
  readonly maxMemoryBytes: number
  readonly maxStackBytes: number
  readonly maxWallTimeMs: number
  readonly maxOperationsPerExecution: number
  readonly maxOperationsPerRun: number
  readonly maxConcurrentOperations: number
}

export const DEFAULT_PROGRAM_ENVIRONMENT_LIMITS: ProgramEnvironmentLimits = {
  maxCodeChars: 32_000,
  maxResultChars: 64_000,
  maxMemoryBytes: 32 * 1024 * 1024,
  maxStackBytes: 512 * 1024,
  maxWallTimeMs: 120_000,
  maxOperationsPerExecution: 64,
  maxOperationsPerRun: 256,
  maxConcurrentOperations: 4,
}

export interface ProgramOperationRecord {
  readonly id: string
  readonly index: number
  readonly kind: ProgramOperationKind
  readonly arguments: readonly unknown[]
  readonly startedAt: string
  readonly endedAt: string
  readonly queueWaitMs: number
  readonly parallelized: boolean
  readonly resourceClass: import('./tools').ToolResourceClass
  readonly status: 'ok' | 'error'
  readonly result?: unknown
  readonly error?: string
}

export interface ProgramEffects {
  readonly images: readonly import('./image').ImageContent[]
  readonly evidence: readonly ToolEvidence[]
  readonly artifacts: readonly ToolArtifact[]
}

export interface ProgramExecutionResult {
  readonly value: unknown
  readonly operations: readonly ProgramOperationRecord[]
  readonly effects: ProgramEffects
  readonly scheduler: ProgramSchedulerSnapshot
  readonly durationMs: number
}

export interface ProgramEnvironmentOptions {
  readonly contextStore: RunContextStore
  readonly listTools: () => readonly ProviderToolSchema[]
  readonly callTool: (name: string, input: unknown) => Promise<ToolResultPayload>
  /** Normalized registry metadata. Missing metadata is serial/non-speculative. */
  readonly toolScheduling?: (name: string) => ToolSchedulingMetadata
  /** Runtime-owned model functions. Absent capabilities fail closed. */
  readonly modelFunctions?: ModelFunctionHost
  readonly limits?: Partial<ProgramEnvironmentLimits>
  readonly signal?: AbortSignal
  readonly clock?: () => Date
  readonly onOperation?: (operation: ProgramOperationRecord) => void | Promise<void>
}

export class ProgramEnvironmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProgramEnvironmentError'
  }
}

/**
 * Persistent, per-run QuickJS/Wasm environment with no ambient host APIs.
 * All effects cross the single JSON bridge installed during initialization.
 */
export class RlmProgramEnvironment {
  private readonly limits: ProgramEnvironmentLimits
  private runtime: QuickJSRuntime | null = null
  private context: QuickJSContext | null = null
  private initializing: Promise<void> | null = null
  private running = false
  private closed = false
  private totalOperations = 0
  private executionOperations = 0
  private operationRecords: ProgramOperationRecord[] = []
  private images: import('./image').ImageContent[] = []
  private evidence: ToolEvidence[] = []
  private artifacts: ToolArtifact[] = []
  private activeDeadline = Number.POSITIVE_INFINITY
  private readonly scheduler: ProgramOperationScheduler
  private readonly pendingBridgeTasks = new Set<Promise<void>>()
  private pendingBridgeOperations = 0

  constructor(private readonly options: ProgramEnvironmentOptions) {
    this.limits = { ...DEFAULT_PROGRAM_ENVIRONMENT_LIMITS, ...options.limits }
    validateLimits(this.limits)
    this.scheduler = new ProgramOperationScheduler({ maxConcurrent: this.limits.maxConcurrentOperations })
  }

  schedulerSnapshot(): ProgramSchedulerSnapshot {
    return this.scheduler.snapshot()
  }

  async execute(code: string): Promise<ProgramExecutionResult> {
    if (this.closed) throw new ProgramEnvironmentError('RLM program environment is closed.')
    if (this.running)
      throw new ProgramEnvironmentError('Concurrent execution in one RLM program environment is not allowed.')
    if (typeof code !== 'string' || code.length === 0)
      throw new ProgramEnvironmentError('Program code must not be empty.')
    if (code.length > this.limits.maxCodeChars) {
      throw new ProgramEnvironmentError(
        `Program code exceeds the ${this.limits.maxCodeChars}-character cap (${code.length}).`,
      )
    }
    if (this.options.signal?.aborted) throw new ProgramEnvironmentError('RLM program execution aborted.')

    await this.initialize()
    const context = this.requireContext()
    this.running = true
    this.executionOperations = 0
    this.operationRecords = []
    this.images = []
    this.evidence = []
    this.artifacts = []
    const started = performance.now()
    this.activeDeadline = started + this.limits.maxWallTimeMs

    try {
      const result = context.evalCode(code, 'rlm-program.js', { type: 'global', strict: true })
      const handle = context.unwrapResult(result)
      try {
        const value = await this.readExecutionValue(context, handle)
        const serialized = JSON.stringify(value)
        if (serialized.length > this.limits.maxResultChars) {
          throw new ProgramEnvironmentError(
            `Program result exceeds the ${this.limits.maxResultChars}-character cap (${serialized.length}).`,
          )
        }
        return {
          value,
          operations: [...this.operationRecords],
          effects: {
            images: [...this.images],
            evidence: [...this.evidence],
            artifacts: [...this.artifacts],
          },
          scheduler: this.scheduler.snapshot(),
          durationMs: Math.max(0, performance.now() - started),
        }
      } finally {
        handle.dispose()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('interrupted')) {
        throw new ProgramEnvironmentError(
          this.options.signal?.aborted ? 'RLM program execution aborted.' : 'RLM program wall-time limit exceeded.',
        )
      }
      throw error instanceof ProgramEnvironmentError ? error : new ProgramEnvironmentError(message)
    } finally {
      this.activeDeadline = Number.POSITIVE_INFINITY
      this.running = false
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.initializing?.catch(() => {})
    await this.scheduler.close()
    await Promise.allSettled(Array.from(this.pendingBridgeTasks))
    this.executePendingJobs()
    this.disposeRuntime()
  }

  private disposeRuntime(): void {
    const context = this.context
    const runtime = this.runtime
    this.context = null
    this.runtime = null
    if (context?.alive) {
      // Native host refs must be released while their owning runtime is alive.
      context.setProp(context.global, '__orchentra_call', context.undefined)
      context.dispose()
    }
    if (runtime?.alive) runtime.dispose()
  }

  private async initialize(): Promise<void> {
    if (this.context) return
    if (!this.initializing) this.initializing = this.createRuntime()
    await this.initializing
  }

  private async createRuntime(): Promise<void> {
    try {
      const module = await newQuickJSWASMModule()
      const runtime = module.newRuntime()
      runtime.setMemoryLimit(this.limits.maxMemoryBytes)
      runtime.setMaxStackSize(this.limits.maxStackBytes)
      runtime.setInterruptHandler(
        () => this.options.signal?.aborted === true || performance.now() > this.activeDeadline,
      )
      const context = runtime.newContext({
        intrinsics: { ...DefaultIntrinsics, Date: false },
      })
      this.runtime = runtime
      this.context = context

      const bridge = context.newFunction(
        '__orchentra_call',
        (operationHandle: QuickJSHandle, payloadHandle: QuickJSHandle) => {
          // QuickJS argument handles are borrowed for this callback only; copy
          // them to host strings before queueing asynchronous work.
          const operation = readString(context, operationHandle, 'operation')
          const payloadJson = readString(context, payloadHandle, 'payload')
          const args = parseArguments(payloadJson)
          const policy = this.schedulingFor(operation, args)
          const submittedAt = performance.now()
          const deferred = context.newPromise()
          this.pendingBridgeOperations++
          const scheduled = this.scheduler.schedule(policy, () => this.dispatch(operation, args, policy, submittedAt))
          const settled = scheduled
            .then(
              (value) => {
                if (context.alive) context.newString(JSON.stringify({ ok: true, value })).consume(deferred.resolve)
              },
              (error: unknown) => {
                if (context.alive) context.newError(error as Error).consume(deferred.reject)
              },
            )
            .finally(() => {
              this.pendingBridgeOperations--
              this.pendingBridgeTasks.delete(settled)
            })
          this.pendingBridgeTasks.add(settled)
          return deferred.handle
        },
      )
      bridge.consume((fn) => context.setProp(context.global, '__orchentra_call', fn))

      const bootstrap = context.evalCode(BOOTSTRAP_SOURCE, 'rlm-bootstrap.js', {
        type: 'global',
        strict: true,
      })
      context.unwrapResult(bootstrap).dispose()
    } catch (error) {
      this.closed = true
      this.disposeRuntime()
      throw new ProgramEnvironmentError(
        `Unable to initialize the RLM Wasm environment: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async dispatch(
    rawOperation: string,
    args: readonly unknown[],
    policy: ProgramSchedulePolicy,
    submittedAt: number,
  ): Promise<unknown> {
    const operation = asOperationKind(rawOperation)
    const contract = PROGRAM_CAPABILITY_CONTRACTS.find((candidate) => candidate.operation === operation)!
    if (args.length < contract.minArgs || args.length > contract.maxArgs) {
      throw new ProgramEnvironmentError(
        `${contract.signature} expects ${formatArgumentRange(contract.minArgs, contract.maxArgs)}; received ${args.length}.`,
      )
    }
    this.executionOperations++
    this.totalOperations++
    if (this.executionOperations > this.limits.maxOperationsPerExecution) {
      throw new ProgramEnvironmentError(
        `Program operation cap exceeded (${this.limits.maxOperationsPerExecution} per execution).`,
      )
    }
    if (this.totalOperations > this.limits.maxOperationsPerRun) {
      throw new ProgramEnvironmentError(`Program operation cap exceeded (${this.limits.maxOperationsPerRun} per run).`)
    }
    if (this.options.signal?.aborted) throw new ProgramEnvironmentError('RLM program execution aborted.')
    if (performance.now() > this.activeDeadline) {
      throw new ProgramEnvironmentError('RLM program wall-time limit exceeded.')
    }

    const index = this.totalOperations
    const id = `program-op-${index}`
    const startedAt = this.now().toISOString()
    const queueWaitMs = Math.max(0, performance.now() - submittedAt)
    try {
      const value = await this.perform(operation, args)
      if (this.options.signal?.aborted) throw new ProgramEnvironmentError('RLM program execution aborted.')
      if (performance.now() > this.activeDeadline) {
        throw new ProgramEnvironmentError('RLM program wall-time limit exceeded.')
      }
      const record: ProgramOperationRecord = {
        id,
        index,
        kind: operation,
        arguments: jsonClone(args) as readonly unknown[],
        startedAt,
        endedAt: this.now().toISOString(),
        queueWaitMs,
        parallelized: policy.parallelSafe,
        resourceClass: policy.resourceClass,
        status: 'ok',
        result: jsonClone(value),
      }
      this.operationRecords.push(record)
      await this.options.onOperation?.(record)
      return value
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const record: ProgramOperationRecord = {
        id,
        index,
        kind: operation,
        arguments: jsonClone(args) as readonly unknown[],
        startedAt,
        endedAt: this.now().toISOString(),
        queueWaitMs,
        parallelized: policy.parallelSafe,
        resourceClass: policy.resourceClass,
        status: 'error',
        error: message,
      }
      this.operationRecords.push(record)
      await this.options.onOperation?.(record)
      throw error
    }
  }

  private schedulingFor(rawOperation: string, args: readonly unknown[]): ProgramSchedulePolicy {
    const operation = asOperationKind(rawOperation)
    if (operation === 'tools.call') {
      const name = typeof args[0] === 'string' ? args[0] : ''
      const metadata = normalizeToolScheduling(this.options.toolScheduling?.(name) ?? DEFAULT_TOOL_SCHEDULING)
      return { parallelSafe: isParallelSafe(metadata), resourceClass: metadata.resourceClass }
    }
    if (
      operation === 'ctx.list' ||
      operation === 'ctx.read' ||
      operation === 'ctx.search' ||
      operation === 'tools.list'
    ) {
      return { parallelSafe: true, resourceClass: 'context' }
    }
    if (operation === 'lm.query' || operation === 'jobs.wait' || operation === 'jobs.status') {
      return { parallelSafe: true, resourceClass: 'model' }
    }
    return { parallelSafe: false, resourceClass: operation === 'ctx.store' ? 'context' : 'model' }
  }

  private async perform(operation: ProgramOperationKind, args: readonly unknown[]): Promise<unknown> {
    switch (operation) {
      case 'ctx.list':
        return this.options.contextStore.list(optionalInteger(args[0]))
      case 'ctx.read': {
        const options = optionalObject(args[1], 'ctx.read options')
        return sanitizeRead(
          this.options.contextStore.read(
            requiredString(args[0], 'handle'),
            optionalInteger(options.offset),
            optionalInteger(options.limit),
          ),
        )
      }
      case 'ctx.search': {
        const options = optionalObject(args[2], 'ctx.search options')
        return this.options.contextStore.search(
          requiredString(args[0], 'handle'),
          requiredString(args[1], 'query'),
          optionalInteger(options.limit),
        )
      }
      case 'ctx.store': {
        const value = args[0]
        const summary = args[1]
        if (summary !== undefined && typeof summary !== 'string') {
          throw new ProgramEnvironmentError('ctx.store summary must be a string when provided.')
        }
        const hasText = typeof value === 'string'
        return this.options.contextStore.store({
          kind: hasText ? 'text' : 'json',
          trust: 'untrusted',
          provenance: { kind: 'model' },
          summary,
          value: hasText ? { text: value } : { data: value },
        })
      }
      case 'tools.list':
        return this.options.listTools().filter((tool) => tool.name !== 'rlm_execute')
      case 'tools.call': {
        const name = requiredString(args[0], 'name')
        if (name === 'rlm_execute') throw new ProgramEnvironmentError('Recursive rlm_execute calls are not allowed.')
        const result = await this.options.callTool(name, args[1] ?? {})
        this.images.push(...(result.images ?? []))
        this.evidence.push(...(result.evidence ?? []))
        this.artifacts.push(...(result.artifacts ?? []))
        let descriptor: ContextDescriptor | undefined
        const rich =
          result.data !== undefined ||
          (result.images?.length ?? 0) > 0 ||
          (result.evidence?.length ?? 0) > 0 ||
          (result.artifacts?.length ?? 0) > 0
        if (rich || result.content.length > 8_000) {
          try {
            descriptor = await this.options.contextStore.storeToolResult(result, name)
          } catch {
            // The JSON result cap still fails closed if the legacy content is
            // too large; context quota failure never hides the tool outcome.
          }
        }
        return sanitizeToolResult(result, descriptor)
      }
      case 'lm.query':
        return this.captureModelResult(await this.requireModelFunctions().query('leaf', args[0], args[1]))
      case 'lm.start':
        return this.requireModelFunctions().start('leaf', args[0], args[1])
      case 'rlm.query':
        return this.captureModelResult(await this.requireModelFunctions().query('recursive', args[0], args[1]))
      case 'rlm.start':
        return this.requireModelFunctions().start('recursive', args[0], args[1])
      case 'jobs.status':
        return this.requireModelFunctions().status(args[0])
      case 'jobs.wait':
        return this.captureModelResult(await this.requireModelFunctions().wait(args[0]))
      case 'jobs.cancel':
        return this.requireModelFunctions().cancel(args[0])
      case 'jobs.send':
        return this.requireModelFunctions().send(args[0], args[1])
      case 'jobs.resume':
        return this.requireModelFunctions().resume(args[0], args[1])
    }
  }

  private requireModelFunctions(): ModelFunctionHost {
    if (!this.options.modelFunctions) {
      throw new ProgramEnvironmentError('RLM model functions are unavailable in this runtime.')
    }
    return this.options.modelFunctions
  }

  private captureModelResult(result: ModelJobResult): unknown {
    this.images.push(...(result.images ?? []))
    this.evidence.push(...(result.evidence ?? []))
    this.artifacts.push(...(result.artifacts ?? []))
    return sanitizeModelResult(result)
  }

  private requireContext(): QuickJSContext {
    if (!this.context) throw new ProgramEnvironmentError('RLM program environment failed to initialize.')
    return this.context
  }

  private async readExecutionValue(context: QuickJSContext, handle: QuickJSHandle): Promise<unknown> {
    for (;;) {
      this.executePendingJobs()
      if (this.options.signal?.aborted) throw new ProgramEnvironmentError('RLM program execution aborted.')
      if (performance.now() > this.activeDeadline) {
        throw new ProgramEnvironmentError('RLM program wall-time limit exceeded.')
      }

      const state = context.getPromiseState(handle)
      if (state.type === 'pending') {
        await this.waitForProgramProgress()
        continue
      }

      if (this.pendingBridgeOperations > 0) {
        if (state.type === 'fulfilled' && !state.notAPromise) state.value.dispose()
        if (state.type === 'rejected') state.error.dispose()
        await this.waitForProgramProgress()
        this.executePendingJobs()
        throw new ProgramEnvironmentError('Program returned before all governed operations were awaited.')
      }

      if (state.type === 'fulfilled' && state.notAPromise) return jsonClone(context.dump(handle))
      if (state.type === 'fulfilled') {
        try {
          return jsonClone(context.dump(state.value))
        } finally {
          state.value.dispose()
        }
      }
      context.unwrapResult(state)
    }
  }

  private async waitForProgramProgress(): Promise<void> {
    const remaining = this.activeDeadline - performance.now()
    if (remaining <= 0) throw new ProgramEnvironmentError('RLM program wall-time limit exceeded.')
    const signal = this.options.signal
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ProgramEnvironmentError('RLM program wall-time limit exceeded.')), remaining)
    })
    const aborted = new Promise<never>((_resolve, reject) => {
      if (!signal) return
      onAbort = () => reject(new ProgramEnvironmentError('RLM program execution aborted.'))
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      if (this.pendingBridgeOperations > 0)
        await Promise.race([...Array.from(this.pendingBridgeTasks), deadline, aborted])
      else await Promise.race([deadline, aborted])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      if (signal && onAbort) signal.removeEventListener('abort', onAbort)
    }
  }

  private executePendingJobs(): void {
    const runtime = this.runtime
    const context = this.context
    if (!runtime || !context || !runtime.alive || !context.alive) return
    const jobs = runtime.executePendingJobs()
    try {
      context.unwrapResult(jobs)
    } finally {
      jobs.dispose()
    }
  }

  private now(): Date {
    return this.options.clock?.() ?? new Date()
  }
}

const BOOTSTRAP_SOURCE = buildBootstrapSource(PROGRAM_CAPABILITY_CONTRACTS)

function buildBootstrapSource(contracts: readonly ProgramCapabilityContract[]): string {
  const definitions = JSON.stringify(
    contracts.map(({ operation, namespace, method }) => ({ operation, namespace, method })),
  )
  return `
  (() => {
    const invoke = async (operation, args) => {
      const envelope = JSON.parse(await __orchentra_call(operation, JSON.stringify(args)))
      if (!envelope.ok) throw new Error(envelope.error || 'host operation failed')
      return envelope.value
    }
    const namespaces = Object.create(null)
    for (const definition of ${definitions}) {
      const api = namespaces[definition.namespace] || (namespaces[definition.namespace] = Object.create(null))
      Object.defineProperty(api, definition.method, {
        value: (...args) => invoke(definition.operation, args),
        enumerable: true,
        writable: false,
        configurable: false,
      })
    }
    for (const [namespace, api] of Object.entries(namespaces)) {
      Object.defineProperty(globalThis, namespace, {
        value: Object.freeze(api),
        enumerable: true,
        writable: false,
        configurable: false,
      })
    }
    if (globalThis.Math) {
      Object.defineProperty(globalThis.Math, 'random', {
        value: () => { throw new Error('randomness is unavailable in the RLM environment') },
        writable: false,
        configurable: false,
      })
    }
  })()
  `
}

function sanitizeRead(result: ContextReadResult): unknown {
  return {
    ...result,
    images: result.images?.map((image) => ({ mediaType: image.mediaType, bytes: decodedByteLength(image.data) })),
  }
}

function sanitizeToolResult(result: ToolResultPayload, descriptor?: ContextDescriptor): unknown {
  const offloaded = descriptor !== undefined && result.content.length > 8_000
  return {
    id: result.id,
    content: offloaded ? `[context_handle ${descriptor.handle}] ${descriptor.summary}` : result.content,
    isError: result.isError,
    contextHandle: descriptor?.handle,
    data: result.data,
    images: result.images?.map((image) => ({ mediaType: image.mediaType, bytes: decodedByteLength(image.data) })),
    artifacts: result.artifacts,
    evidence: result.evidence,
  }
}

function sanitizeModelResult(result: ModelJobResult): unknown {
  const maxInlineChars = 4_000
  const truncated = result.text.length > maxInlineChars
  return {
    jobId: result.jobId,
    callKind: result.callKind,
    status: result.status,
    model: result.model,
    depth: result.depth,
    attempt: result.attempt,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    doneReason: result.doneReason,
    contextHandle: result.contextHandle,
    traceId: result.traceId,
    usage: result.usage,
    text: truncated
      ? `${result.text.slice(0, maxInlineChars)}\n[truncated; read contextHandle for full result]`
      : result.text,
    truncated,
    isError: result.isError,
    images: result.images?.map((image) => ({ mediaType: image.mediaType, bytes: decodedByteLength(image.data) })),
    artifacts: result.artifacts,
    evidence: result.evidence,
  }
}

function asOperationKind(value: string): ProgramOperationKind {
  const allowed = PROGRAM_CAPABILITY_CONTRACTS.map((contract) => contract.operation)
  if (!allowed.includes(value as ProgramOperationKind)) {
    throw new ProgramEnvironmentError(`Unsupported program operation: ${value}`)
  }
  return value as ProgramOperationKind
}

function readString(context: QuickJSContext, handle: QuickJSHandle, label: string): string {
  if (context.typeof(handle) !== 'string') throw new ProgramEnvironmentError(`${label} must be a string.`)
  return context.getString(handle)
}

function parseArguments(value: string): readonly unknown[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new ProgramEnvironmentError('Program operation payload must be valid JSON.')
  }
  if (!Array.isArray(parsed)) throw new ProgramEnvironmentError('Program operation arguments must be a JSON array.')
  return parsed
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new ProgramEnvironmentError(`${label} must be a non-empty string.`)
  return value
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value)) throw new ProgramEnvironmentError('Expected an integer option.')
  return value as number
}

function optionalObject(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value))
    throw new ProgramEnvironmentError(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function formatArgumentRange(min: number, max: number): string {
  if (min === max) return `${min} argument${min === 1 ? '' : 's'}`
  return `${min}-${max} arguments`
}

function jsonClone(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value === undefined ? null : value)
    return JSON.parse(serialized) as unknown
  } catch (error) {
    throw new ProgramEnvironmentError(
      `Program values must be JSON-serializable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function validateLimits(limits: ProgramEnvironmentLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new ProgramEnvironmentError(`Program environment limit ${name} must be a positive integer.`)
    }
  }
}

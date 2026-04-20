export type WorkerStatus = 'spawning' | 'trust_required' | 'ready_for_prompt' | 'running' | 'finished' | 'failed'

export type WorkerFailureKind = 'trust_gate' | 'prompt_delivery' | 'protocol' | 'provider' | 'startup_no_evidence'

export interface WorkerFailure {
  kind: WorkerFailureKind
  message: string
  createdAt: number
}

export type WorkerEventKind =
  | 'spawning'
  | 'trust_required'
  | 'trust_resolved'
  | 'ready_for_prompt'
  | 'prompt_misdelivery'
  | 'prompt_replay_armed'
  | 'running'
  | 'restarted'
  | 'finished'
  | 'failed'
  | 'startup_no_evidence'

export type WorkerTrustResolution = 'auto_allowlisted' | 'manual_approval'

export type WorkerPromptTarget = 'shell' | 'wrong_target' | 'wrong_task' | 'unknown'

export type StartupFailureClassification =
  | 'trust_required'
  | 'prompt_misdelivery'
  | 'prompt_acceptance_timeout'
  | 'transport_dead'
  | 'worker_crashed'
  | 'unknown'

export interface StartupEvidenceBundle {
  lastLifecycleState: WorkerStatus
  paneCommand: string
  promptSentAt?: number
  promptAcceptanceState: boolean
  trustPromptDetected: boolean
  transportHealthy: boolean
  mcpHealthy: boolean
  elapsedSeconds: number
}

export type WorkerEventPayload =
  | { type: 'trust_prompt'; cwd: string; resolution?: WorkerTrustResolution }
  | {
      type: 'prompt_delivery'
      promptPreview: string
      observedTarget: WorkerPromptTarget
      observedCwd?: string
      observedPromptPreview?: string
      taskReceipt?: WorkerTaskReceipt
      recoveryArmed: boolean
    }
  | { type: 'startup_no_evidence'; evidence: StartupEvidenceBundle; classification: StartupFailureClassification }

export interface WorkerTaskReceipt {
  repo: string
  taskKind: string
  sourceSurface: string
  expectedArtifacts: string[]
  objectivePreview: string
}

export interface WorkerEvent {
  seq: number
  kind: WorkerEventKind
  status: WorkerStatus
  detail?: string
  payload?: WorkerEventPayload
  timestamp: number
}

export interface Worker {
  workerId: string
  cwd: string
  status: WorkerStatus
  trustAutoResolve: boolean
  trustGateCleared: boolean
  autoRecoverPromptMisdelivery: boolean
  promptDeliveryAttempts: number
  promptInFlight: boolean
  lastPrompt?: string
  expectedReceipt?: WorkerTaskReceipt
  replayPrompt?: string
  lastError?: WorkerFailure
  createdAt: number
  updatedAt: number
  events: WorkerEvent[]
}

export interface WorkerReadySnapshot {
  workerId: string
  status: WorkerStatus
  ready: boolean
  blocked: boolean
  replayPromptReady: boolean
  lastError?: WorkerFailure
}

function nowSecs(): number {
  return Math.floor(Date.now() / 1000)
}

interface PromptDeliveryObservation {
  target: WorkerPromptTarget
  observedCwd?: string
  observedPromptPreview?: string
}

export class WorkerRegistry {
  private workers: Map<string, Worker> = new Map()
  private counter = 0

  create(cwd: string, trustedRoots: string[], autoRecoverPromptMisdelivery: boolean): Worker {
    this.counter++
    const ts = nowSecs()
    const workerId = `worker_${ts.toString(16).padStart(8, '0')}_${this.counter}`
    const trustAutoResolve = trustedRoots.some((root) => pathMatchesAllowlist(cwd, root))

    const worker: Worker = {
      workerId,
      cwd,
      status: 'spawning',
      trustAutoResolve,
      trustGateCleared: false,
      autoRecoverPromptMisdelivery,
      promptDeliveryAttempts: 0,
      promptInFlight: false,
      lastPrompt: undefined,
      expectedReceipt: undefined,
      replayPrompt: undefined,
      lastError: undefined,
      createdAt: ts,
      updatedAt: ts,
      events: [],
    }
    pushEvent(worker, 'spawning', 'spawning', 'worker created')
    this.workers.set(workerId, worker)
    return worker
  }

  get(workerId: string): Worker | undefined {
    return this.workers.get(workerId)
  }

  observe(workerId: string, screenText: string): Worker | Error {
    const worker = this.workers.get(workerId)
    if (!worker) return new Error(`worker not found: ${workerId}`)

    const lowered = screenText.toLowerCase()

    if (!worker.trustGateCleared && detectTrustPrompt(lowered)) {
      worker.status = 'trust_required'
      worker.lastError = {
        kind: 'trust_gate',
        message: 'worker boot blocked on trust prompt',
        createdAt: nowSecs(),
      }
      pushEvent(worker, 'trust_required', 'trust_required', 'trust prompt detected', {
        type: 'trust_prompt',
        cwd: worker.cwd,
      })

      if (worker.trustAutoResolve) {
        worker.trustGateCleared = true
        worker.lastError = undefined
        worker.status = 'spawning'
        pushEvent(worker, 'trust_resolved', 'spawning', 'allowlisted repo auto-resolved trust prompt', {
          type: 'trust_prompt',
          cwd: worker.cwd,
          resolution: 'auto_allowlisted',
        })
      } else {
        this.workers.set(workerId, worker)
        return worker
      }
    }

    if (worker.promptInFlight && worker.lastPrompt) {
      const observation = detectPromptMisdelivery(
        screenText,
        lowered,
        worker.lastPrompt,
        worker.cwd,
        worker.expectedReceipt,
      )
      if (observation) {
        const preview = promptPreview(worker.lastPrompt)
        const message =
          observation.target === 'shell'
            ? `worker prompt landed in shell instead of coding agent: ${preview}`
            : observation.target === 'wrong_target'
              ? `worker prompt landed in the wrong target instead of ${worker.cwd}: ${preview}`
              : observation.target === 'wrong_task'
                ? `worker prompt receipt mismatched the expected task context for ${worker.cwd}: ${preview}`
                : `worker prompt delivery failed before reaching coding agent: ${preview}`

        worker.lastError = {
          kind: 'prompt_delivery',
          message,
          createdAt: nowSecs(),
        }
        worker.promptInFlight = false
        pushEvent(worker, 'prompt_misdelivery', 'failed', promptMisdeliveryDetail(observation), {
          type: 'prompt_delivery',
          promptPreview: preview,
          observedTarget: observation.target,
          observedCwd: observation.observedCwd,
          observedPromptPreview: observation.observedPromptPreview,
          taskReceipt: worker.expectedReceipt ? { ...worker.expectedReceipt } : undefined,
          recoveryArmed: false,
        })
        if (worker.autoRecoverPromptMisdelivery) {
          worker.replayPrompt = worker.lastPrompt
          worker.status = 'ready_for_prompt'
          pushEvent(worker, 'prompt_replay_armed', 'ready_for_prompt', 'prompt replay armed after prompt misdelivery', {
            type: 'prompt_delivery',
            promptPreview: preview,
            observedTarget: observation.target,
            observedCwd: observation.observedCwd,
            observedPromptPreview: observation.observedPromptPreview,
            taskReceipt: worker.expectedReceipt ? { ...worker.expectedReceipt } : undefined,
            recoveryArmed: true,
          })
        } else {
          worker.status = 'failed'
        }
        this.workers.set(workerId, worker)
        return worker
      }
    }

    if (detectRunningCue(lowered) && worker.promptInFlight) {
      worker.promptInFlight = false
      worker.status = 'running'
      worker.lastError = undefined
    }

    if (detectReadyForPrompt(screenText, lowered) && worker.status !== 'ready_for_prompt') {
      worker.status = 'ready_for_prompt'
      worker.promptInFlight = false
      if (worker.lastError?.kind === 'trust_gate') {
        worker.lastError = undefined
      }
      pushEvent(worker, 'ready_for_prompt', 'ready_for_prompt', 'worker is ready for prompt delivery')
    }

    this.workers.set(workerId, worker)
    return worker
  }

  resolveTrust(workerId: string): Worker | Error {
    const worker = this.workers.get(workerId)
    if (!worker) return new Error(`worker not found: ${workerId}`)

    if (worker.status !== 'trust_required') {
      return new Error(`worker ${workerId} is not waiting on trust; current status: ${worker.status}`)
    }

    worker.trustGateCleared = true
    worker.lastError = undefined
    worker.status = 'spawning'
    pushEvent(worker, 'trust_resolved', 'spawning', 'trust prompt resolved manually', {
      type: 'trust_prompt',
      cwd: worker.cwd,
      resolution: 'manual_approval',
    })
    this.workers.set(workerId, worker)
    return worker
  }

  sendPrompt(workerId: string, prompt?: string, taskReceipt?: WorkerTaskReceipt): Worker | Error {
    const worker = this.workers.get(workerId)
    if (!worker) return new Error(`worker not found: ${workerId}`)

    if (worker.status !== 'ready_for_prompt') {
      return new Error(`worker ${workerId} is not ready for prompt delivery; current status: ${worker.status}`)
    }

    const nextPrompt = prompt?.trim() || worker.replayPrompt
    if (!nextPrompt) {
      return new Error(`worker ${workerId} has no prompt to send or replay`)
    }

    worker.promptDeliveryAttempts++
    worker.promptInFlight = true
    worker.lastPrompt = nextPrompt
    worker.expectedReceipt = taskReceipt
    worker.replayPrompt = undefined
    worker.lastError = undefined
    worker.status = 'running'
    pushEvent(worker, 'running', 'running', `prompt dispatched to worker: ${promptPreview(nextPrompt)}`)
    this.workers.set(workerId, worker)
    return worker
  }

  awaitReady(workerId: string): WorkerReadySnapshot | Error {
    const worker = this.workers.get(workerId)
    if (!worker) return new Error(`worker not found: ${workerId}`)

    return {
      workerId: worker.workerId,
      status: worker.status,
      ready: worker.status === 'ready_for_prompt',
      blocked: worker.status === 'trust_required' || worker.status === 'failed',
      replayPromptReady: worker.replayPrompt !== undefined,
      lastError: worker.lastError,
    }
  }

  restart(workerId: string): Worker | Error {
    const worker = this.workers.get(workerId)
    if (!worker) return new Error(`worker not found: ${workerId}`)

    worker.status = 'spawning'
    worker.trustGateCleared = false
    worker.lastPrompt = undefined
    worker.replayPrompt = undefined
    worker.lastError = undefined
    worker.promptDeliveryAttempts = 0
    worker.promptInFlight = false
    pushEvent(worker, 'restarted', 'spawning', 'worker restarted')
    this.workers.set(workerId, worker)
    return worker
  }

  terminate(workerId: string): Worker | Error {
    const worker = this.workers.get(workerId)
    if (!worker) return new Error(`worker not found: ${workerId}`)

    worker.status = 'finished'
    worker.promptInFlight = false
    pushEvent(worker, 'finished', 'finished', 'worker terminated by control plane')
    this.workers.set(workerId, worker)
    return worker
  }

  observeCompletion(workerId: string, finishReason: string, tokensOutput: number): Worker | Error {
    const worker = this.workers.get(workerId)
    if (!worker) return new Error(`worker not found: ${workerId}`)

    const isProviderFailure = (finishReason === 'unknown' && tokensOutput === 0) || finishReason === 'error'

    if (isProviderFailure) {
      const message =
        finishReason === 'unknown' && tokensOutput === 0
          ? "session completed with finish='unknown' and zero output — provider degraded or context exhausted"
          : `session failed with finish='${finishReason}' — provider error`

      worker.lastError = { kind: 'provider', message, createdAt: nowSecs() }
      worker.status = 'failed'
      worker.promptInFlight = false
      pushEvent(worker, 'failed', 'failed', 'provider failure classified')
    } else {
      worker.status = 'finished'
      worker.promptInFlight = false
      worker.lastError = undefined
      pushEvent(worker, 'finished', 'finished', `session completed: finish='${finishReason}', tokens=${tokensOutput}`)
    }

    this.workers.set(workerId, worker)
    return worker
  }

  observeStartupTimeout(
    workerId: string,
    paneCommand: string,
    transportHealthy: boolean,
    mcpHealthy: boolean,
  ): Worker | Error {
    const worker = this.workers.get(workerId)
    if (!worker) return new Error(`worker not found: ${workerId}`)

    const now = nowSecs()
    const elapsed = now - worker.createdAt

    const evidence: StartupEvidenceBundle = {
      lastLifecycleState: worker.status,
      paneCommand,
      promptSentAt: worker.promptDeliveryAttempts > 0 ? worker.updatedAt : undefined,
      promptAcceptanceState: worker.status === 'running' && !worker.promptInFlight,
      trustPromptDetected: worker.events.some((e) => e.kind === 'trust_required'),
      transportHealthy,
      mcpHealthy,
      elapsedSeconds: elapsed,
    }

    const classification = classifyStartupFailure(evidence)

    worker.lastError = {
      kind: 'startup_no_evidence',
      message: `worker startup stalled after ${elapsed}s — classified as ${classification}`,
      createdAt: now,
    }
    worker.status = 'failed'
    worker.promptInFlight = false

    pushEvent(
      worker,
      'startup_no_evidence',
      'failed',
      `startup timeout with evidence: last_state=${evidence.lastLifecycleState}, trust_detected=${evidence.trustPromptDetected}, prompt_accepted=${evidence.promptAcceptanceState}`,
      { type: 'startup_no_evidence', evidence, classification },
    )

    this.workers.set(workerId, worker)
    return worker
  }
}

function pushEvent(
  worker: Worker,
  kind: WorkerEventKind,
  status: WorkerStatus,
  detail: string,
  payload?: WorkerEventPayload,
): void {
  const timestamp = nowSecs()
  const seq = worker.events.length + 1
  worker.updatedAt = timestamp
  worker.status = status
  worker.events.push({ seq, kind, status, detail, payload, timestamp })
}

export function classifyStartupFailure(evidence: StartupEvidenceBundle): StartupFailureClassification {
  if (!evidence.transportHealthy) {
    return 'transport_dead'
  }

  if (evidence.trustPromptDetected && evidence.lastLifecycleState === 'trust_required') {
    return 'trust_required'
  }

  if (
    evidence.promptSentAt !== undefined &&
    !evidence.promptAcceptanceState &&
    evidence.lastLifecycleState === 'running'
  ) {
    return 'prompt_acceptance_timeout'
  }

  if (evidence.promptSentAt !== undefined && !evidence.promptAcceptanceState && evidence.elapsedSeconds > 30) {
    return 'prompt_misdelivery'
  }

  if (!evidence.mcpHealthy && evidence.transportHealthy) {
    return 'worker_crashed'
  }

  return 'unknown'
}

function detectTrustPrompt(lowered: string): boolean {
  return [
    'do you trust the files in this folder',
    'trust the files in this folder',
    'trust this folder',
    'allow and continue',
    'yes, proceed',
  ].some((needle) => lowered.includes(needle))
}

function detectReadyForPrompt(screenText: string, lowered: string): boolean {
  if (
    ['ready for input', 'ready for your input', 'ready for prompt', 'send a message'].some((needle) =>
      lowered.includes(needle),
    )
  ) {
    return true
  }

  const lines = screenText.split('\n')
  let lastNonEmpty = ''
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (trimmed.length > 0) {
      lastNonEmpty = trimmed
      break
    }
  }

  if (isShellPrompt(lastNonEmpty)) {
    return false
  }

  return (
    lastNonEmpty === '>' ||
    lastNonEmpty === '›' ||
    lastNonEmpty === '❯' ||
    lastNonEmpty.startsWith('> ') ||
    lastNonEmpty.startsWith('› ') ||
    lastNonEmpty.startsWith('❯ ') ||
    lastNonEmpty.includes('│ >') ||
    lastNonEmpty.includes('│ ›') ||
    lastNonEmpty.includes('│ ❯')
  )
}

function detectRunningCue(lowered: string): boolean {
  return ['thinking', 'working', 'running tests', 'inspecting', 'analyzing'].some((needle) => lowered.includes(needle))
}

function isShellPrompt(trimmed: string): boolean {
  return (
    trimmed.endsWith('$') ||
    trimmed.endsWith('%') ||
    trimmed.endsWith('#') ||
    trimmed.startsWith('$') ||
    trimmed.startsWith('%') ||
    trimmed.startsWith('#')
  )
}

function detectPromptMisdelivery(
  screenText: string,
  lowered: string,
  prompt: string,
  expectedCwd: string,
  expectedReceipt?: WorkerTaskReceipt,
): PromptDeliveryObservation | null {
  const promptSnippet =
    prompt
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0)
      ?.toLowerCase() ?? ''
  if (promptSnippet.length === 0) return null

  const promptVisible = lowered.includes(promptSnippet)
  const observedPromptPreview = detectPromptEcho(screenText)

  if (expectedReceipt) {
    const receiptVisible = taskReceiptVisible(lowered, expectedReceipt)
    const mismatchedPromptVisible = observedPromptPreview?.toLowerCase().includes(promptSnippet) === false

    if ((promptVisible || mismatchedPromptVisible) && !receiptVisible) {
      return {
        target: 'wrong_task',
        observedCwd: detectObservedShellCwd(screenText),
        observedPromptPreview,
      }
    }
  }

  const observedCwd = detectObservedShellCwd(screenText)
  if (observedCwd && promptVisible && !cwdMatchesObservedTarget(expectedCwd, observedCwd)) {
    return {
      target: 'wrong_target',
      observedCwd,
      observedPromptPreview,
    }
  }

  const shellError = [
    'command not found',
    'syntax error near unexpected token',
    'parse error near',
    'no such file or directory',
    'unknown command',
  ].some((needle) => lowered.includes(needle))

  if (shellError && promptVisible) {
    return {
      target: 'shell',
      observedCwd: undefined,
      observedPromptPreview,
    }
  }

  return null
}

function promptPreview(prompt: string): string {
  const trimmed = prompt.trim()
  if (trimmed.length <= 48) return trimmed
  return trimmed.slice(0, 48).trimEnd() + '…'
}

function detectPromptEcho(screenText: string): string | undefined {
  for (const line of screenText.split('\n')) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('›')) {
      const content = trimmed.slice(1).trim()
      if (content.length > 0) return content
    }
  }
  return undefined
}

function taskReceiptVisible(lowered: string, receipt: WorkerTaskReceipt): boolean {
  const tokens = [
    receipt.repo.toLowerCase(),
    receipt.taskKind.toLowerCase(),
    receipt.sourceSurface.toLowerCase(),
    receipt.objectivePreview.toLowerCase(),
  ]

  return (
    tokens.every((token) => lowered.includes(token)) &&
    receipt.expectedArtifacts.every((artifact) => lowered.includes(artifact.toLowerCase()))
  )
}

function promptMisdeliveryDetail(observation: PromptDeliveryObservation): string {
  switch (observation.target) {
    case 'shell':
      return 'shell misdelivery detected'
    case 'wrong_target':
      return 'prompt landed in wrong target'
    case 'wrong_task':
      return 'prompt receipt mismatched expected task context'
    case 'unknown':
      return 'prompt delivery failure detected'
  }
}

function detectObservedShellCwd(screenText: string): string | undefined {
  for (const line of screenText.split('\n')) {
    const tokens = line.split(/\s+/)
    const promptIndex = tokens.findIndex((t) => isShellPromptToken(t))
    if (promptIndex > 0) {
      const candidate = tokens[promptIndex - 1]
      if (looksLikeCwdLabel(candidate)) return candidate
    }
  }
  return undefined
}

function isShellPromptToken(token: string): boolean {
  return token === '$' || token === '%' || token === '#' || token === '>' || token === '›' || token === '❯'
}

function looksLikeCwdLabel(candidate: string): boolean {
  return candidate.startsWith('/') || candidate.startsWith('~') || candidate.startsWith('.') || candidate.includes('/')
}

function cwdMatchesObservedTarget(expectedCwd: string, observedCwd: string): boolean {
  const expectedBase = expectedCwd.split('/').pop() ?? expectedCwd
  const observedBase = observedCwd.split('/').pop()?.replace(/:$/, '') ?? observedCwd

  return expectedCwd.endsWith(observedCwd) || observedCwd.endsWith(expectedCwd) || expectedBase === observedBase
}

function pathMatchesAllowlist(cwd: string, trustedRoot: string): boolean {
  return cwd === trustedRoot || cwd.startsWith(trustedRoot)
}

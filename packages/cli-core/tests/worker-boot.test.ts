import { describe, expect, test } from 'bun:test'
import { WorkerRegistry, classifyStartupFailure } from '../src/runtime/worker-boot'
import type { Worker, WorkerTaskReceipt, StartupEvidenceBundle } from '../src/runtime/worker-boot'

describe('WorkerRegistry.create', () => {
  test('creates worker with spawning status', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    expect(w.status).toBe('spawning')
    expect(w.cwd).toBe('/workspace/repo')
    expect(w.trustAutoResolve).toBe(false)
    expect(w.trustGateCleared).toBe(false)
    expect(w.promptDeliveryAttempts).toBe(0)
    expect(w.promptInFlight).toBe(false)
    expect(w.lastPrompt).toBeUndefined()
    expect(w.lastError).toBeUndefined()
    expect(w.events.length).toBe(1)
    expect(w.events[0].kind).toBe('spawning')
  })

  test('auto-resolves trust when cwd matches trusted root', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', ['/workspace/repo'], false)
    expect(w.trustAutoResolve).toBe(true)
  })

  test('auto-resolves trust when cwd is under trusted root', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo/src', ['/workspace/repo'], false)
    expect(w.trustAutoResolve).toBe(true)
  })

  test('does not auto-resolve trust for unrelated paths', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/other/repo', ['/workspace/repo'], false)
    expect(w.trustAutoResolve).toBe(false)
  })
})

describe('WorkerRegistry.get', () => {
  test('returns created worker', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    expect(reg.get(w.workerId)).toBe(w)
  })

  test('returns undefined for unknown worker', () => {
    const reg = new WorkerRegistry()
    expect(reg.get('nonexistent')).toBeUndefined()
  })
})

describe('WorkerRegistry.observe — trust gate', () => {
  test('detects trust prompt and sets trust_required status', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, 'Do you trust the files in this folder?')
    const updated = reg.get(w.workerId)!
    expect(updated.status).toBe('trust_required')
    expect(updated.lastError?.kind).toBe('trust_gate')
  })

  test('auto-resolves trust when trustAutoResolve is true', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', ['/workspace/repo'], false)
    reg.observe(w.workerId, 'Do you trust the files in this folder?')
    const updated = reg.get(w.workerId)!
    expect(updated.trustGateCleared).toBe(true)
    expect(updated.status).toBe('spawning')
    expect(updated.lastError).toBeUndefined()
    expect(updated.events.some((e) => e.kind === 'trust_resolved')).toBe(true)
  })

  test('manual trust resolution via resolveTrust', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, 'Allow and continue?')
    const result = reg.resolveTrust(w.workerId) as Worker
    expect(result.trustGateCleared).toBe(true)
    expect(result.status).toBe('spawning')
    expect(result.events.some((e) => e.kind === 'trust_resolved')).toBe(true)
  })

  test('resolveTrust errors on wrong status', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    const result = reg.resolveTrust(w.workerId)
    expect(result).toBeInstanceOf(Error)
  })
})

describe('WorkerRegistry.observe — ready for prompt', () => {
  test('detects ready_for_prompt from chevron prompt', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, 'some output\n❯')
    const updated = reg.get(w.workerId)!
    expect(updated.status).toBe('ready_for_prompt')
  })

  test('detects ready_for_prompt from angle bracket', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, 'ready for input')
    const updated = reg.get(w.workerId)!
    expect(updated.status).toBe('ready_for_prompt')
  })

  test('does not set ready_for_prompt from shell prompt', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, 'user@host $')
    const updated = reg.get(w.workerId)!
    expect(updated.status).toBe('spawning')
  })
})

describe('WorkerRegistry.observe — running cue', () => {
  test('detects running cue and clears promptInFlight', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, '❯')
    reg.sendPrompt(w.workerId, 'implement feature X')
    reg.observe(w.workerId, 'Thinking about the implementation...')
    const updated = reg.get(w.workerId)!
    expect(updated.status).toBe('running')
    expect(updated.promptInFlight).toBe(false)
  })
})

describe('WorkerRegistry.observe — prompt misdelivery', () => {
  test('detects shell misdelivery', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, '❯')
    reg.sendPrompt(w.workerId, 'implement feature X')
    reg.observe(w.workerId, 'implement feature X\ncommand not found')
    const updated = reg.get(w.workerId)!
    expect(updated.status).toBe('failed')
    expect(updated.lastError?.kind).toBe('prompt_delivery')
  })

  test('auto-recovers from prompt misdelivery', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], true)
    reg.observe(w.workerId, '❯')
    reg.sendPrompt(w.workerId, 'implement feature X')
    reg.observe(w.workerId, 'implement feature X\ncommand not found')
    const updated = reg.get(w.workerId)!
    expect(updated.status).toBe('ready_for_prompt')
    expect(updated.replayPrompt).toBe('implement feature X')
    expect(updated.events.some((e) => e.kind === 'prompt_replay_armed')).toBe(true)
  })

  test('detects wrong task when receipt mismatched', () => {
    const receipt: WorkerTaskReceipt = {
      repo: 'owner/repo',
      taskKind: 'bugfix',
      sourceSurface: 'issue',
      expectedArtifacts: ['src/fix.ts'],
      objectivePreview: 'fix the bug in module',
    }
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], true)
    reg.observe(w.workerId, '❯')
    reg.sendPrompt(w.workerId, 'implement feature X', receipt)
    reg.observe(w.workerId, 'implement feature X\nsome unrelated output')
    const updated = reg.get(w.workerId)!
    expect(updated.lastError?.kind).toBe('prompt_delivery')
  })
})

describe('WorkerRegistry.sendPrompt', () => {
  test('sends prompt to ready worker', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, '❯')
    const result = reg.sendPrompt(w.workerId, 'implement feature X') as Worker
    expect(result.status).toBe('running')
    expect(result.promptInFlight).toBe(true)
    expect(result.lastPrompt).toBe('implement feature X')
    expect(result.promptDeliveryAttempts).toBe(1)
  })

  test('errors when worker not ready', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    const result = reg.sendPrompt(w.workerId, 'test')
    expect(result).toBeInstanceOf(Error)
  })

  test('errors when no prompt provided', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, '❯')
    const result = reg.sendPrompt(w.workerId)
    expect(result).toBeInstanceOf(Error)
  })

  test('uses replay prompt when no new prompt given', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], true)
    reg.observe(w.workerId, '❯')
    reg.sendPrompt(w.workerId, 'first prompt')
    reg.observe(w.workerId, 'first prompt\ncommand not found')
    reg.sendPrompt(w.workerId)
    const updated = reg.get(w.workerId)!
    expect(updated.lastPrompt).toBe('first prompt')
    expect(updated.promptDeliveryAttempts).toBe(2)
  })
})

describe('WorkerRegistry.awaitReady', () => {
  test('returns ready snapshot for ready worker', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, '❯')
    const snapshot = reg.awaitReady(w.workerId)
    expect(snapshot).toMatchObject({
      status: 'ready_for_prompt',
      ready: true,
      blocked: false,
      replayPromptReady: false,
    })
  })

  test('returns blocked snapshot for trust_required worker', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, 'Do you trust the files in this folder?')
    const snapshot = reg.awaitReady(w.workerId)
    expect(snapshot).toMatchObject({
      ready: false,
      blocked: true,
    })
  })

  test('errors on unknown worker', () => {
    const reg = new WorkerRegistry()
    const result = reg.awaitReady('nonexistent')
    expect(result).toBeInstanceOf(Error)
  })
})

describe('WorkerRegistry.restart', () => {
  test('resets worker to spawning', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, '❯')
    reg.sendPrompt(w.workerId, 'do stuff')
    const restarted = reg.restart(w.workerId) as Worker
    expect(restarted.status).toBe('spawning')
    expect(restarted.trustGateCleared).toBe(false)
    expect(restarted.lastPrompt).toBeUndefined()
    expect(restarted.promptDeliveryAttempts).toBe(0)
    expect(restarted.events.some((e) => e.kind === 'restarted')).toBe(true)
  })
})

describe('WorkerRegistry.terminate', () => {
  test('sets worker to finished', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    const terminated = reg.terminate(w.workerId) as Worker
    expect(terminated.status).toBe('finished')
    expect(terminated.promptInFlight).toBe(false)
    expect(terminated.events.some((e) => e.kind === 'finished')).toBe(true)
  })
})

describe('WorkerRegistry.observeCompletion', () => {
  test('marks worker finished on normal completion', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, '❯')
    reg.sendPrompt(w.workerId, 'do stuff')
    const result = reg.observeCompletion(w.workerId, 'end_turn', 150) as Worker
    expect(result.status).toBe('finished')
    expect(result.lastError).toBeUndefined()
  })

  test('classifies unknown finish with zero output as provider failure', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, '❯')
    reg.sendPrompt(w.workerId, 'do stuff')
    const result = reg.observeCompletion(w.workerId, 'unknown', 0) as Worker
    expect(result.status).toBe('failed')
    expect(result.lastError?.kind).toBe('provider')
  })

  test('classifies error finish as provider failure', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    reg.observe(w.workerId, '❯')
    reg.sendPrompt(w.workerId, 'do stuff')
    const result = reg.observeCompletion(w.workerId, 'error', 50) as Worker
    expect(result.status).toBe('failed')
    expect(result.lastError?.kind).toBe('provider')
  })

  test('errors on unknown worker', () => {
    const reg = new WorkerRegistry()
    const result = reg.observeCompletion('nonexistent', 'end_turn', 0)
    expect(result).toBeInstanceOf(Error)
  })
})

describe('WorkerRegistry.observeStartupTimeout', () => {
  test('classifies and records failure evidence', () => {
    const reg = new WorkerRegistry()
    const w = reg.create('/workspace/repo', [], false)
    const result = reg.observeStartupTimeout(w.workerId, 'claude', true, false) as Worker
    expect(result.status).toBe('failed')
    expect(result.lastError?.kind).toBe('startup_no_evidence')
    expect(result.events.some((e) => e.kind === 'startup_no_evidence')).toBe(true)
  })
})

describe('classifyStartupFailure', () => {
  function makeEvidence(overrides: Partial<StartupEvidenceBundle> = {}): StartupEvidenceBundle {
    return {
      lastLifecycleState: 'spawning',
      paneCommand: 'claude',
      promptSentAt: undefined,
      promptAcceptanceState: false,
      trustPromptDetected: false,
      transportHealthy: true,
      mcpHealthy: true,
      elapsedSeconds: 45,
      ...overrides,
    }
  }

  test('returns transport_dead when transport unhealthy', () => {
    expect(classifyStartupFailure(makeEvidence({ transportHealthy: false }))).toBe('transport_dead')
  })

  test('returns trust_required when trust prompt detected and unresolved', () => {
    expect(
      classifyStartupFailure(makeEvidence({ trustPromptDetected: true, lastLifecycleState: 'trust_required' })),
    ).toBe('trust_required')
  })

  test('returns prompt_acceptance_timeout when prompt sent but not accepted', () => {
    expect(
      classifyStartupFailure(
        makeEvidence({
          promptSentAt: 100,
          promptAcceptanceState: false,
          lastLifecycleState: 'running',
        }),
      ),
    ).toBe('prompt_acceptance_timeout')
  })

  test('returns prompt_misdelivery when prompt sent and elapsed > 30s', () => {
    expect(
      classifyStartupFailure(
        makeEvidence({
          promptSentAt: 100,
          promptAcceptanceState: false,
          elapsedSeconds: 60,
        }),
      ),
    ).toBe('prompt_misdelivery')
  })

  test('returns worker_crashed when mcp unhealthy but transport healthy', () => {
    expect(classifyStartupFailure(makeEvidence({ mcpHealthy: false }))).toBe('worker_crashed')
  })

  test('returns unknown when no specific evidence', () => {
    expect(classifyStartupFailure(makeEvidence())).toBe('unknown')
  })
})

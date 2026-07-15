import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CompletionPolicy,
  ConversationRuntime,
  buildSystemPrompt,
  createRunState,
  recordToolResult,
  traceManifestPath,
  traceSpecPath,
  type ConversationConfig,
  type ConversationDeps,
  type Provider,
  type ProviderStreamEvent,
  type RunState,
  type RuntimeEvent,
  type ToolRegistry,
  type ToolResult,
} from '../src/runtime'

function provider(turns: ProviderStreamEvent[][]): Provider {
  let index = 0
  return {
    async *stream() {
      for (const event of turns[index++] ?? []) yield event
    },
  }
}

function verificationTools(): ToolRegistry {
  return {
    list: () => [{ name: 'verify', description: 'run verification', inputSchema: { type: 'object' } }],
    has: (name) => name === 'verify',
    register: () => {},
    execute: async (): Promise<ToolResult> => ({
      content: 'tests passed',
      isError: false,
      evidence: [{ kind: 'exit-status', summary: 'exit code 0', detail: { exitCode: 0, command: 'bun test' } }],
    }),
  }
}

function config(cwd: string): ConversationConfig {
  return {
    model: 'test',
    maxOutputTokens: 1024,
    contextWindowTokens: 200_000,
    compactionThreshold: 0.8,
    keepRecentOnCompact: 6,
    budget: { maxSteps: 10, maxTokens: 100_000 },
    sessionId: 'completion-gate',
    cwd,
  }
}

function deps(source: Provider, tools: ToolRegistry): ConversationDeps {
  return { provider: source, tools, systemPrompt: buildSystemPrompt({ staticParts: ['test'], dynamicParts: [] }) }
}

function policy(replay?: ConstructorParameters<typeof CompletionPolicy>[0]['replay']): CompletionPolicy {
  return new CompletionPolicy({
    obligations: [{ id: 'test', description: 'tests pass', evidenceKinds: ['exit-status'] }],
    k: 3,
    maxRetries: 2,
    replay,
  })
}

async function run(
  runtime: ConversationRuntime,
  input: Parameters<ConversationRuntime['run']>[0],
): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = []
  for await (const event of runtime.run(input)) events.push(event)
  return events
}

describe('CompletionPolicy gate', () => {
  test('unverified fixture cannot report done even when provider says end_turn', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-gate-missing-'))
    try {
      const runtime = new ConversationRuntime(
        config(cwd),
        deps(
          provider([
            [{ kind: 'finish', stopReason: 'end_turn' }],
            [{ kind: 'finish', stopReason: 'end_turn' }],
            [{ kind: 'finish', stopReason: 'end_turn' }],
          ]),
          verificationTools(),
        ),
      )
      const events = await run(runtime, { userMessage: 'fix fixture', completionPolicy: policy() })
      const done = events
        .filter((event): event is Extract<RuntimeEvent, { kind: 'done' }> => event.kind === 'done')
        .at(-1)
      const gates = events.filter(
        (event): event is Extract<RuntimeEvent, { kind: 'gate_decision' }> => event.kind === 'gate_decision',
      )

      expect(done?.reason).toBe('gate_failed')
      expect(gates).toHaveLength(3)
      expect(gates.every((event) => event.decision.outcome === 'assert_failed')).toBe(true)
      expect(events.some((event) => event.kind === 'done' && event.reason === 'stop')).toBe(false)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test('approved k/k gate records decision, finalizes manifest, then emits replay spec from it', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-gate-pass-'))
    try {
      const runtime = new ConversationRuntime(
        config(cwd),
        deps(
          provider([
            [
              { kind: 'tool-use', call: { id: 'verify-1', name: 'verify', input: {} } },
              { kind: 'finish', stopReason: 'tool_use' },
            ],
            [{ kind: 'finish', stopReason: 'end_turn' }],
          ]),
          verificationTools(),
        ),
      )
      const events = await run(runtime, { userMessage: 'fix fixture', completionPolicy: policy() })
      const done = events.find((event): event is Extract<RuntimeEvent, { kind: 'done' }> => event.kind === 'done')
      const decision = events.find(
        (event): event is Extract<RuntimeEvent, { kind: 'gate_decision' }> => event.kind === 'gate_decision',
      )
      const traceId = runtime.lastTraceId!

      expect(done?.reason).toBe('stop')
      expect(decision?.decision.outcome).toBe('pass')
      expect(decision?.decision.trials).toHaveLength(3)
      const manifest = JSON.parse(readFileSync(traceManifestPath(cwd, traceId), 'utf8')) as {
        gateDecisions: Array<{ outcome: string }>
      }
      expect(manifest.gateDecisions.at(-1)?.outcome).toBe('pass')
      const spec = traceSpecPath(cwd, traceId)
      expect(existsSync(spec)).toBe(true)
      expect(readFileSync(spec, 'utf8')).toContain(traceManifestPath(cwd, traceId))
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test('seeded 1/3 replay auto-quarantines with normalized failure signature', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-gate-flaky-'))
    try {
      const replay = {
        replay: async () => [
          { passed: true, summary: 'trial 1 passed' },
          { passed: false, summary: 'trial 2 failed at 2026-07-15T12:30:00Z /tmp/flaky.ts:44' },
          { passed: false, summary: 'trial 3 failed at 2026-07-15T12:30:01Z /tmp/flaky.ts:45' },
        ],
      }
      const runtime = new ConversationRuntime(
        config(cwd),
        deps(
          provider([
            [
              { kind: 'tool-use', call: { id: 'verify-1', name: 'verify', input: {} } },
              { kind: 'finish', stopReason: 'tool_use' },
            ],
            [{ kind: 'finish', stopReason: 'end_turn' }],
          ]),
          verificationTools(),
        ),
      )
      const events = await run(runtime, { userMessage: 'flaky fixture', completionPolicy: policy(replay) })
      const done = events.find((event): event is Extract<RuntimeEvent, { kind: 'done' }> => event.kind === 'done')
      const decision = events.find(
        (event): event is Extract<RuntimeEvent, { kind: 'gate_decision' }> => event.kind === 'gate_decision',
      )
      const quarantined = events.find(
        (event): event is Extract<RuntimeEvent, { kind: 'run_state' }> =>
          event.kind === 'run_state' && event.state.state === 'QUARANTINE',
      )

      expect(done?.reason).toBe('quarantined')
      expect(decision?.decision.outcome).toBe('quarantined')
      expect(quarantined?.state.artifacts[0]?.uri).toMatch(/\.orchentra\/quarantine\/[a-f0-9]{16}\.json$/)
      expect(existsSync(quarantined!.state.artifacts[0]!.uri)).toBe(true)
      const saved = JSON.parse(readFileSync(quarantined!.state.artifacts[0]!.uri, 'utf8')) as {
        signature: { normalizedLog: string }
      }
      expect(saved.signature.normalizedLog).toContain('<TS>')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test('restored mid-EXECUTE state resumes through observe/assert/gate to done', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-gate-resume-'))
    try {
      let state: RunState = createRunState('interrupted fixture', policy().obligations, '2026-07-15T00:00:00.000Z')
      state = recordToolResult(
        state,
        {
          id: 'verify-before-kill',
          content: 'tests passed',
          isError: false,
          evidence: [{ kind: 'exit-status', summary: 'exit code 0' }],
        },
        '2026-07-15T00:00:01.000Z',
      )
      state = { ...state, state: 'EXECUTE' }
      const runtime = new ConversationRuntime(
        config(cwd),
        deps(provider([[{ kind: 'finish', stopReason: 'end_turn' }]]), verificationTools()),
      )
      const events = await run(runtime, {
        userMessage: 'interrupted fixture',
        completionPolicy: policy(),
        runState: state,
        resume: true,
      })
      const states = events
        .filter((event): event is Extract<RuntimeEvent, { kind: 'run_state' }> => event.kind === 'run_state')
        .map((event) => event.state.state)

      expect(states).toContain('OBSERVE')
      expect(states).toContain('ASSERT')
      expect(states).toContain('GATE')
      expect(states.at(-1)).toBe('DONE')
      expect(events.find((event) => event.kind === 'done')?.reason).toBe('stop')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

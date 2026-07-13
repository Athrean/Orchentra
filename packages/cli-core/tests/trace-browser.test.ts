import { describe, expect, test } from 'bun:test'
import { ConversationRuntime, type ConversationConfig, type ConversationDeps } from '../src/runtime/conversation'
import type { Provider, ProviderStreamEvent } from '../src/runtime/provider'
import type { ToolRegistry, ToolResult } from '../src/runtime/tools'
import type { RuntimeEvent } from '../src/runtime/events'
import { buildSystemPrompt } from '../src/runtime/system-prompt'
import type { TraceManifest, TraceSink } from '../src/runtime/trace'

function fakeProvider(responses: ProviderStreamEvent[][]): Provider {
  let callIndex = 0
  return {
    async *stream() {
      const resp = responses[callIndex++] ?? []
      for (const ev of resp) yield ev
    },
  }
}

function toolsReturning(results: Record<string, ToolResult>): ToolRegistry {
  return {
    list: () => [],
    has: (name) => name in results,
    execute: async (name): Promise<ToolResult> => results[name] ?? { content: 'noop', isError: false },
  }
}

function captureManifest(): { sink: TraceSink; manifests: TraceManifest[] } {
  const manifests: TraceManifest[] = []
  return { sink: { append: () => {}, finalize: (m) => void manifests.push(m) }, manifests }
}

function config(): ConversationConfig {
  return {
    model: 'test',
    maxOutputTokens: 1024,
    contextWindowTokens: 100000,
    compactionThreshold: 0.7,
    keepRecentOnCompact: 4,
    budget: { maxSteps: 10, maxTokens: 100000 },
    sessionId: 'trace-browser',
    cwd: '/tmp',
  }
}

async function run(deps: ConversationDeps, message: string): Promise<void> {
  const rt = new ConversationRuntime(config(), deps)
  const events: RuntimeEvent[] = []
  for await (const ev of rt.run({ userMessage: message })) events.push(ev)
}

describe('trace manifest — browser fields carry real data (M2)', () => {
  test('navigation, console/network deltas, and test results reach the manifest', async () => {
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 't1', name: 'browser_navigate', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'tool-use', call: { id: 't2', name: 'browser_snapshot', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'tool-use', call: { id: 't3', name: 'bash', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'verified' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const tools = toolsReturning({
      browser_navigate: {
        content: 'navigated',
        isError: false,
        evidence: [{ kind: 'browser-navigation', summary: 'nav', detail: { url: 'http://127.0.0.1:4000/' } }],
      },
      browser_snapshot: {
        content: '[browser_snapshot] url',
        isError: false,
        evidence: [
          {
            kind: 'browser-snapshot',
            summary: 'snap',
            detail: {
              url: 'http://127.0.0.1:4000/login',
              newConsoleErrors: [{ text: 'Invalid credentials', at: 't1' }],
              newFailedRequests: [{ url: '/api/login', method: 'POST', status: 401, at: 't1' }],
            },
          },
        ],
      },
      bash: {
        content: 'exit code 0',
        isError: false,
        evidence: [{ kind: 'exit-status', summary: 'exit 0', detail: { command: 'bun test fixture', exitCode: 0 } }],
      },
    })
    const { sink, manifests } = captureManifest()
    const deps: ConversationDeps = {
      provider,
      tools,
      systemPrompt: buildSystemPrompt({ staticParts: ['sys'], dynamicParts: [] }),
      traceSink: sink,
      persistToolOutput: async () => {},
    }

    await run(deps, 'fix the login and verify')

    expect(manifests).toHaveLength(1)
    const m = manifests[0]!
    expect(m.browserState).toEqual({ lastUrl: 'http://127.0.0.1:4000/login', navigations: 1 })
    expect(m.consoleErrors).toEqual([{ text: 'Invalid credentials', at: 't1' }])
    expect(m.networkFailures).toEqual([{ url: '/api/login', method: 'POST', status: 401, at: 't1' }])
    expect(m.testResults).toEqual([{ command: 'bun test fixture', exitCode: 0, passed: true }])
    expect(m.screenshots).toBeNull()
  })

  test('a browser run with no console/network issues records empty arrays, not null', async () => {
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 't1', name: 'browser_snapshot', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [{ kind: 'finish', stopReason: 'end_turn' }],
    ])
    const tools = toolsReturning({
      browser_snapshot: {
        content: '[browser_snapshot] clean',
        isError: false,
        evidence: [
          {
            kind: 'browser-snapshot',
            summary: 'clean',
            detail: { url: 'http://x/', newConsoleErrors: [], newFailedRequests: [] },
          },
        ],
      },
    })
    const { sink, manifests } = captureManifest()
    await run(
      {
        provider,
        tools,
        systemPrompt: buildSystemPrompt({ staticParts: ['sys'], dynamicParts: [] }),
        traceSink: sink,
        persistToolOutput: async () => {},
      },
      'observe',
    )
    const m = manifests[0]!
    expect(m.browserState).toEqual({ lastUrl: 'http://x/', navigations: 0 })
    expect(m.consoleErrors).toEqual([])
    expect(m.networkFailures).toEqual([])
  })

  test('a screenshot taken at an assertion point is referenced in the manifest', async () => {
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 't1', name: 'browser_screenshot', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [{ kind: 'finish', stopReason: 'end_turn' }],
    ])
    const tools = toolsReturning({
      browser_screenshot: {
        content: 'screenshot saved',
        isError: false,
        artifacts: [{ uri: '/tmp/.orchentra/artifacts/shot-1.png', kind: 'file', action: 'created' }],
        evidence: [
          {
            kind: 'browser-screenshot',
            summary: 'shot',
            detail: { path: '/tmp/.orchentra/artifacts/shot-1.png', bytes: 2048 },
          },
        ],
      },
    })
    const { sink, manifests } = captureManifest()
    await run(
      {
        provider,
        tools,
        systemPrompt: buildSystemPrompt({ staticParts: ['sys'], dynamicParts: [] }),
        traceSink: sink,
        persistToolOutput: async () => {},
      },
      'screenshot the result',
    )
    const m = manifests[0]!
    // Artifact ref reaches both the deduped file list and the screenshots field.
    expect(m.screenshots).toEqual(['/tmp/.orchentra/artifacts/shot-1.png'])
    expect(m.filesChanged.map((a) => a.uri)).toContain('/tmp/.orchentra/artifacts/shot-1.png')
  })

  test('a run with no browser ops leaves the browser fields null', async () => {
    const provider = fakeProvider([
      [
        { kind: 'text-delta', delta: 'no browser' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const { sink, manifests } = captureManifest()
    await run(
      {
        provider,
        tools: toolsReturning({}),
        systemPrompt: buildSystemPrompt({ staticParts: ['sys'], dynamicParts: [] }),
        traceSink: sink,
        persistToolOutput: async () => {},
      },
      'hi',
    )
    const m = manifests[0]!
    expect(m.browserState).toBeNull()
    expect(m.consoleErrors).toBeNull()
    expect(m.networkFailures).toBeNull()
    expect(m.testResults).toBeNull()
  })
})
